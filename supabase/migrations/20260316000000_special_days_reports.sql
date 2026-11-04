-- 1) One-off school days: a row in school_closures with no hours = no school;
--    with hours = that date's start/end replaces the weekly hours.
--    Release times (default_release_at) follow automatically via school_day_for.
-- 2) Reports: teachers see the detentions they marked; homeroom their class
--    (and their own marks); admin/secretary everything.
-- Run after 20260315000000_self_teaching_role.sql. Safe to paste again.

alter table public.school_closures add column if not exists start_clock time;
alter table public.school_closures add column if not exists end_clock time;

alter table public.school_closures drop constraint if exists school_closures_hours_check;
alter table public.school_closures add constraint school_closures_hours_check
  check (
    (start_clock is null and end_clock is null)
    or (end_clock is not null and (start_clock is null or start_clock < end_clock))
  );

grant update (start_clock, end_clock) on public.school_closures to authenticated;

drop policy if exists closures_update on public.school_closures;
create policy closures_update on public.school_closures
  for update to authenticated
  using (public.is_admin() or public.my_role() = 'secretary')
  with check (public.is_admin() or public.my_role() = 'secretary');

create or replace function public.school_day_for(p_at timestamptz)
returns table (
  local_ts timestamp,
  local_date date,
  start_clock time,
  end_clock time,
  closed boolean,
  closed_message text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  weekday int;
  sample_start time;
  sample_end time;
  special_start time;
  special_end time;
  message_start time;
  message_end time;
begin
  local_ts := timezone('Asia/Jerusalem', p_at);
  local_date := local_ts::date;
  weekday := extract(dow from local_ts)::int;

  select
    case weekday
      when 0 then s.start_sun when 1 then s.start_mon when 2 then s.start_tue
      when 3 then s.start_wed when 4 then s.start_thu when 5 then s.start_fri
      else s.start_sat
    end,
    case weekday
      when 0 then s.end_sun when 1 then s.end_mon when 2 then s.end_tue
      when 3 then s.end_wed when 4 then s.end_thu when 5 then s.end_fri
      else s.end_sat
    end
  into start_clock, end_clock
  from public.school_settings s
  where s.id = 1;

  select s.start_sun, s.end_sun into sample_start, sample_end
  from public.school_settings s where s.id = 1;
  if sample_start is null or sample_end is null then
    select pair.start_clock, pair.end_clock into sample_start, sample_end
    from (
      select start_sun as start_clock, end_sun as end_clock from public.school_settings where id = 1
      union all select start_mon, end_mon from public.school_settings where id = 1
      union all select start_tue, end_tue from public.school_settings where id = 1
      union all select start_wed, end_wed from public.school_settings where id = 1
      union all select start_thu, end_thu from public.school_settings where id = 1
      union all select start_fri, end_fri from public.school_settings where id = 1
    ) pair
    where pair.start_clock is not null and pair.end_clock is not null
    limit 1;
  end if;

  -- One-off day: closure row with hours replaces the weekly hours; without hours it is no school.
  select c.start_clock, c.end_clock into special_start, special_end
  from public.school_closures c where c.closure_date = local_date;
  if special_end is not null then
    start_clock := coalesce(special_start, start_clock, time '07:00');
    end_clock := special_end;
  end if;

  message_start := coalesce(start_clock, sample_start, time '07:00');
  message_end := coalesce(end_clock, sample_end, time '16:00');
  closed_message := format(
    'סימון השארות פתוח בימי לימודים בין %s ל-%s',
    to_char(message_start, 'HH24:MI'),
    to_char(message_end, 'HH24:MI')
  );

  closed := start_clock is null
    or end_clock is null
    or exists (
      select 1 from public.school_closures c
      where c.closure_date = local_date and c.end_clock is null
    );
  return next;
end;
$$;

revoke all on function public.school_day_for(timestamptz) from public, anon, authenticated;

create or replace function public.list_report_detentions(p_from date, p_to date)
returns table (
  id uuid,
  student_id uuid,
  reason_text text,
  duration_minutes integer,
  status public.detention_status,
  detention_date date,
  release_at timestamptz,
  marked_at timestamptz,
  signed_at timestamptz,
  notes text,
  student_first_name text,
  student_last_name text,
  class_id uuid,
  class_name text,
  marker_name text,
  signer_name text,
  releaser_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.caller_permitted() then
    raise exception 'אין הרשאה לדוח';
  end if;
  if public.my_role() not in ('teacher', 'homeroom', 'secretary', 'admin') then
    raise exception 'אין הרשאה לדוח';
  end if;
  return query
  select
    d.id,
    d.student_id,
    d.reason_text,
    d.duration_minutes,
    d.status,
    d.detention_date,
    d.release_at,
    d.marked_at,
    d.signed_at,
    d.notes,
    s.first_name,
    s.last_name,
    s.class_id,
    c.name,
    marker.full_name,
    signer.full_name,
    releaser.full_name
  from public.detentions d
  join public.students s on s.id = d.student_id
  left join public.classes c on c.id = s.class_id
  left join public.profiles marker on marker.id = d.marked_by
  left join public.profiles signer on signer.id = d.signed_by
  left join public.profiles releaser on releaser.id = d.released_by
  where d.detention_date between p_from and p_to
    and (
      public.my_role() in ('secretary', 'admin')
      or c.homeroom_teacher_id = auth.uid()
      or d.marked_by = auth.uid()
    )
  order by d.detention_date desc, s.last_name;
end;
$$;

revoke all on function public.list_report_detentions(date, date) from public, anon;
grant execute on function public.list_report_detentions(date, date) to authenticated;

notify pgrst, 'reload schema';
