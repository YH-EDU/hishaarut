-- School hours gate and a per-parent WhatsApp template.
-- Marking is allowed only between that day's start and end, Asia/Jerusalem.
-- Saturday is closed unless a start and end are filled in.
-- A date in school_closures is a holiday. Release stays on the same day,
-- from the end of school until three hours later.
-- Safe to paste again.

alter table public.school_settings add column if not exists start_sun time not null default '07:00';
alter table public.school_settings add column if not exists start_mon time not null default '07:00';
alter table public.school_settings add column if not exists start_tue time not null default '07:00';
alter table public.school_settings add column if not exists start_wed time not null default '07:00';
alter table public.school_settings add column if not exists start_thu time not null default '07:00';
alter table public.school_settings add column if not exists start_fri time not null default '07:00';
alter table public.school_settings add column if not exists start_sat time;
alter table public.school_settings add column if not exists parent_message_template text;

grant select (
  start_sun, start_mon, start_tue, start_wed, start_thu, start_fri, start_sat,
  parent_message_template
), update (
  start_sun, start_mon, start_tue, start_wed, start_thu, start_fri, start_sat,
  parent_message_template
) on public.school_settings to authenticated;

create table if not exists public.school_closures (
  closure_date date primary key,
  created_at timestamptz not null default now()
);

revoke all on public.school_closures from public, anon, authenticated;
grant select, insert, delete on public.school_closures to authenticated;

alter table public.school_closures enable row level security;

drop policy if exists closures_select on public.school_closures;
create policy closures_select on public.school_closures
  for select to authenticated
  using (public.is_staff());

drop policy if exists closures_insert on public.school_closures;
create policy closures_insert on public.school_closures
  for insert to authenticated
  with check (public.is_admin() or public.my_role() = 'secretary');

drop policy if exists closures_delete on public.school_closures;
create policy closures_delete on public.school_closures
  for delete to authenticated
  using (public.is_admin() or public.my_role() = 'secretary');

alter table public.notification_log add column if not exists audience text not null default '';

alter table public.notification_log drop constraint if exists notification_log_unique;
alter table public.notification_log drop constraint if exists notification_log_audience_unique;
alter table public.notification_log
  add constraint notification_log_audience_unique
  unique (detention_id, event, recipient_type, audience);

create or replace function public.default_parent_message_template()
returns text
language sql
immutable
as $$
  select E'שלום {parent_name},\nרצינו לעדכן שבנך {student_name} מכיתה {class} יישאר היום בבית הספר לאחר סיום הלימודים, עד השעה {release_time}.\nסיבה: {reason}\nלשאלות אפשר לפנות למזכירות.\nבברכה, צוות הישיבה'
$$;

update public.school_settings
set parent_message_template = public.default_parent_message_template()
where id = 1
  and (parent_message_template is null or btrim(parent_message_template) = '');

create or replace function public.apply_parent_template(
  p_template text,
  p_parent_name text,
  p_student_name text,
  p_class_name text,
  p_release_time text,
  p_reason text
)
returns text
language plpgsql
immutable
as $$
declare
  body text;
  name text;
begin
  body := coalesce(nullif(btrim(coalesce(p_template, '')), ''), public.default_parent_message_template());
  name := nullif(btrim(coalesce(p_parent_name, '')), '');
  if name is null then
    body := replace(body, 'שלום {parent_name}', 'שלום');
    body := replace(body, '{parent_name}', 'שלום');
  else
    body := replace(body, '{parent_name}', name);
  end if;
  body := replace(body, '{student_name}', coalesce(p_student_name, ''));
  body := replace(body, '{class}', coalesce(p_class_name, ''));
  body := replace(body, '{release_time}', coalesce(p_release_time, ''));
  body := replace(body, '{reason}', coalesce(p_reason, ''));
  return body;
end;
$$;

revoke all on function public.apply_parent_template(text, text, text, text, text, text) from public, anon;
grant execute on function public.apply_parent_template(text, text, text, text, text, text) to authenticated;

create or replace function public.assert_day_pair(p_start time, p_end time)
returns void
language plpgsql
as $$
begin
  if (p_start is null) <> (p_end is null) then
    raise exception 'יש למלא שעת התחלה וסיום, או להשאיר את היום סגור';
  end if;
  if p_start is not null and p_start >= p_end then
    raise exception 'שעת ההתחלה חייבת להיות לפני שעת הסיום';
  end if;
end;
$$;

revoke all on function public.assert_day_pair(time, time) from public, anon, authenticated;

-- Local school day for a timestamp. closed is true on Saturday, on a holiday,
-- and when that weekday has no start and end.
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
      select 1 from public.school_closures c where c.closure_date = local_date
    );
  return next;
end;
$$;

revoke all on function public.school_day_for(timestamptz) from public, anon, authenticated;

create or replace function public.default_release_at(marked timestamptz, minutes integer)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  day record;
  day_end timestamptz;
  candidate timestamptz;
  cap timestamptz;
  midnight timestamptz;
begin
  if minutes is null or minutes < 1 or minutes > 240 then
    raise exception 'משך ההשארות אינו תקין';
  end if;
  select * into day from public.school_day_for(marked);
  if day.closed
    or day.local_ts::time < day.start_clock
    or day.local_ts::time >= day.end_clock
  then
    raise exception '%', day.closed_message;
  end if;

  day_end := (day.local_date + day.end_clock) at time zone 'Asia/Jerusalem';
  candidate := day_end + make_interval(mins => minutes);
  cap := day_end + interval '3 hours';
  midnight := (day.local_date + 1) at time zone 'Asia/Jerusalem';
  if candidate > cap then
    candidate := cap;
  end if;
  if candidate >= midnight then
    candidate := midnight - interval '1 minute';
  end if;
  if candidate < day_end then
    candidate := day_end;
  end if;
  return candidate;
end;
$$;

create or replace function public.detentions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  official_label text;
  day record;
  day_end timestamptz;
begin
  if auth.uid() is null or not public.can_mark_detentions() then
    raise exception 'אין הרשאה לסמן השארות';
  end if;
  if not exists (
    select 1 from public.students s where s.id = new.student_id and s.active
  ) then
    raise exception 'התלמיד אינו פעיל';
  end if;
  if new.duration_minutes is null or new.duration_minutes < 1 or new.duration_minutes > 240 then
    raise exception 'משך ההשארות אינו תקין';
  end if;

  if new.reason_id is not null then
    select r.label into official_label
    from public.detention_reasons r
    where r.id = new.reason_id and r.active;
    if official_label is null then
      raise exception 'הסיבה אינה פעילה';
    end if;
    new.reason_text := official_label;
  else
    new.reason_text := trim(coalesce(new.reason_text, ''));
  end if;

  if char_length(new.reason_text) < 1 then
    raise exception 'יש לבחור סיבה';
  end if;

  if new.notes is not null then
    new.notes := nullif(trim(new.notes), '');
  end if;

  new.marked_by := auth.uid();
  new.marked_at := now();
  new.status := 'pending';
  new.detention_date := (timezone('Asia/Jerusalem', now()))::date;
  new.signed_by := null;
  new.signed_at := null;
  new.completed_at := null;
  new.cancelled_by := null;
  new.cancelled_at := null;
  new.release_override_by := null;
  new.release_override_at := null;
  new.released_by := null;
  new.early_release := false;

  select * into day from public.school_day_for(now());
  if day.closed
    or day.local_ts::time < day.start_clock
    or day.local_ts::time >= day.end_clock
  then
    raise exception '%', day.closed_message;
  end if;

  day_end := (day.local_date + day.end_clock) at time zone 'Asia/Jerusalem';
  if new.release_at is null then
    new.release_at := public.default_release_at(new.marked_at, new.duration_minutes);
  else
    if (timezone('Asia/Jerusalem', new.release_at))::date <> day.local_date
      or new.release_at < day_end
      or new.release_at > day_end + interval '3 hours'
    then
      raise exception 'שעת היציאה יכולה להיות מסיום הלימודים ועד שלוש שעות אחריו, באותו היום';
    end if;
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.school_settings_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.my_role() = 'secretary' and not public.is_admin() then
    if new.school_name is distinct from old.school_name
      or new.allowed_email_domain is distinct from old.allowed_email_domain
      or new.allowed_domain is distinct from old.allowed_domain
      or new.notification_mode is distinct from old.notification_mode
      or new.whatsapp_phone_number_id is distinct from old.whatsapp_phone_number_id
      or new.whatsapp_display_number is distinct from old.whatsapp_display_number
      or new.owner_id is distinct from old.owner_id
      or new.auto_approve_domain is distinct from old.auto_approve_domain
    then
      raise exception 'מזכירות יכולה לעדכן רק את שעות הלימודים ואת נוסח ההודעה להורים';
    end if;
  elsif auth.uid() is not null and not public.is_admin() then
    raise exception 'רק מנהל יכול לעדכן הגדרות';
  end if;

  perform public.assert_day_pair(new.start_sun, new.end_sun);
  perform public.assert_day_pair(new.start_mon, new.end_mon);
  perform public.assert_day_pair(new.start_tue, new.end_tue);
  perform public.assert_day_pair(new.start_wed, new.end_wed);
  perform public.assert_day_pair(new.start_thu, new.end_thu);
  perform public.assert_day_pair(new.start_fri, new.end_fri);
  perform public.assert_day_pair(new.start_sat, new.end_sat);

  new.id := 1;
  new.school_name := trim(new.school_name);
  if new.allowed_email_domain is not null then
    new.allowed_email_domain := nullif(lower(trim(new.allowed_email_domain)), '');
  end if;
  if new.auto_approve_domain is not null then
    new.auto_approve_domain := nullif(lower(trim(new.auto_approve_domain)), '');
  end if;
  if new.whatsapp_phone_number_id is not null then
    new.whatsapp_phone_number_id := nullif(trim(new.whatsapp_phone_number_id), '');
  end if;
  if new.whatsapp_display_number is not null then
    new.whatsapp_display_number := nullif(trim(new.whatsapp_display_number), '');
  end if;
  if new.parent_message_template is not null then
    new.parent_message_template := nullif(btrim(new.parent_message_template), '');
    if new.parent_message_template is not null and char_length(new.parent_message_template) > 2000 then
      raise exception 'נוסח ההודעה ארוך מדי';
    end if;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enqueue_notifications(
  p_detention_id uuid,
  p_event public.notification_event
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  school text;
  template text;
  mode text;
  channel public.notification_channel;
  student_name text;
  release_label text;
  homeroom_phone text;
  homeroom_status public.notification_status;
  homeroom_error text;
  parent record;
  parent_phone text;
  fallbacks text[];
  parent_status public.notification_status;
  parent_error text;
  parent_label text;
  body text;
begin
  select
    dt.id,
    dt.reason_text,
    dt.duration_minutes,
    dt.release_at,
    dt.marked_by,
    s.first_name,
    s.last_name,
    s.gender,
    s.parent_name,
    s.parent_phone as raw_parent_phone,
    s.parent_phone_2 as raw_parent_phone_2,
    s.parent_phone_no_whatsapp,
    s.parent_phone_2_no_whatsapp,
    s.parent2_name,
    s.parent2_phone as raw_parent2_phone,
    s.parent2_phone_2 as raw_parent2_phone_2,
    s.parent2_phone_no_whatsapp,
    s.parent2_phone_2_no_whatsapp,
    c.name as class_name,
    c.homeroom_teacher_id,
    hp.full_name as homeroom_name,
    hp.phone as raw_homeroom_phone,
    mp.full_name as marker_name
  into d
  from public.detentions dt
  join public.students s on s.id = dt.student_id
  join public.classes c on c.id = s.class_id
  left join public.profiles hp on hp.id = c.homeroom_teacher_id
  left join public.profiles mp on mp.id = dt.marked_by
  where dt.id = p_detention_id;

  if d.id is null then
    return;
  end if;

  select ss.school_name, ss.notification_mode, ss.parent_message_template
  into school, mode, template
  from public.school_settings ss
  where ss.id = 1;

  school := coalesce(nullif(trim(school), ''), 'בית הספר');
  channel := case
    when mode = 'cloud_api' then 'whatsapp_cloud'::public.notification_channel
    else 'whatsapp_link'::public.notification_channel
  end;
  student_name := trim(d.first_name) || ' ' || trim(d.last_name);
  release_label := to_char(timezone('Asia/Jerusalem', d.release_at), 'HH24:MI');

  for parent in
    select *
    from (
      values
        (
          'father',
          d.parent_name,
          nullif(btrim(coalesce(d.raw_parent_phone, '')), '') is not null
            or nullif(btrim(coalesce(d.raw_parent_phone_2, '')), '') is not null,
          public.ordered_parent_phones(
            d.raw_parent_phone, d.raw_parent_phone_2, null, null,
            d.parent_phone_no_whatsapp, d.parent_phone_2_no_whatsapp, true, true
          )
        ),
        (
          'mother',
          d.parent2_name,
          nullif(btrim(coalesce(d.raw_parent2_phone, '')), '') is not null
            or nullif(btrim(coalesce(d.raw_parent2_phone_2, '')), '') is not null,
          public.ordered_parent_phones(
            null, null, d.raw_parent2_phone, d.raw_parent2_phone_2,
            true, true, d.parent2_phone_no_whatsapp, d.parent2_phone_2_no_whatsapp
          )
        )
    ) as slot(audience, parent_name, has_raw, phones)
  loop
    if not parent.has_raw and nullif(btrim(coalesce(parent.parent_name, '')), '') is null then
      continue;
    end if;

    if cardinality(parent.phones) = 0 then
      parent_phone := null;
      fallbacks := '{}';
      parent_status := 'skipped';
      parent_error := case
        when not parent.has_raw then 'no_phone'
        when public.normalize_phone_il(case when parent.audience = 'father' then d.raw_parent_phone else d.raw_parent2_phone end) is not null
          or public.normalize_phone_il(case when parent.audience = 'father' then d.raw_parent_phone_2 else d.raw_parent2_phone_2 end) is not null
          then 'no_whatsapp'
        else 'invalid_phone'
      end;
    else
      parent_phone := parent.phones[1];
      fallbacks := parent.phones[2:cardinality(parent.phones)];
      parent_status := 'pending';
      parent_error := null;
    end if;

    parent_label := coalesce(nullif(btrim(coalesce(parent.parent_name, '')), ''), case when parent.audience = 'father' then 'אב' else 'אם' end);
    if p_event = 'marked' then
      body := public.apply_parent_template(template, parent.parent_name, student_name, d.class_name, release_label, d.reason_text);
    else
      body := public.render_detention_message(
        p_event, 'parent', d.gender, student_name, d.class_name,
        d.reason_text, d.duration_minutes, school, d.marker_name
      );
    end if;

    insert into public.notification_log (
      detention_id, event, recipient_type, audience, channel,
      recipient_phone, fallback_phones, recipient_label, message_body, status, error_text
    )
    values (
      d.id, p_event, 'parent', parent.audience, channel,
      parent_phone, fallbacks, parent_label, body, parent_status, parent_error
    )
    on conflict (detention_id, event, recipient_type, audience) do nothing;
  end loop;

  homeroom_phone := public.normalize_phone_il(d.raw_homeroom_phone);
  if d.homeroom_teacher_id is null then
    homeroom_status := 'skipped';
    homeroom_error := 'no_homeroom';
    homeroom_phone := null;
  elsif p_event = 'marked' and d.homeroom_teacher_id = d.marked_by then
    homeroom_status := 'skipped';
    homeroom_error := 'marked_by_homeroom';
    homeroom_phone := null;
  elsif homeroom_phone is null then
    homeroom_status := 'skipped';
    homeroom_error := case
      when nullif(trim(coalesce(d.raw_homeroom_phone, '')), '') is null then 'no_phone'
      else 'invalid_phone'
    end;
  else
    homeroom_status := 'pending';
    homeroom_error := null;
  end if;

  insert into public.notification_log (
    detention_id, event, recipient_type, audience, channel,
    recipient_phone, fallback_phones, recipient_label, message_body, status, error_text
  )
  values (
    d.id, p_event, 'homeroom', '', channel, homeroom_phone, '{}',
    coalesce(nullif(trim(d.homeroom_name), ''), 'מחנך/ת'),
    public.render_detention_message(
      p_event, 'homeroom', d.gender, student_name, d.class_name,
      d.reason_text, d.duration_minutes, school, d.marker_name
    ),
    homeroom_status, homeroom_error
  )
  on conflict (detention_id, event, recipient_type, audience) do nothing;
end;
$$;

create or replace function public.protect_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_sign() then
    raise exception 'אין הרשאה לעדכן שליחה';
  end if;

  new.detention_id := old.detention_id;
  new.event := old.event;
  new.recipient_type := old.recipient_type;
  new.audience := old.audience;
  new.channel := old.channel;
  new.recipient_phone := old.recipient_phone;
  new.fallback_phones := old.fallback_phones;
  new.recipient_label := old.recipient_label;
  new.message_body := old.message_body;
  new.provider_message_id := old.provider_message_id;
  new.error_text := old.error_text;
  new.created_at := old.created_at;

  if old.status = 'skipped' then
    raise exception 'אין מספר לשליחה';
  end if;

  if new.status = 'sent' and old.status in ('pending', 'failed') then
    new.sent_by := auth.uid();
    new.sent_at := now();
  elsif new.status = 'pending' and old.status = 'sent' then
    new.sent_by := null;
    new.sent_at := null;
  elsif new.status is distinct from old.status then
    raise exception 'מעבר סטטוס שליחה אינו חוקי';
  else
    new.sent_by := old.sent_by;
    new.sent_at := old.sent_at;
    new.status := old.status;
  end if;

  return new;
end;
$$;
