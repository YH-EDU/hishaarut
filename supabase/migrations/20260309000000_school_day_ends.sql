-- Weekly school end times. A detention starts when the school day ends.
-- Sunday, Monday, Wednesday, Thursday 16:00. Tuesday 14:00. Friday 12:00.
-- Saturday is off unless an admin or secretary sets a time.
-- Times are Asia/Jerusalem. Safe to paste again.

alter table public.school_settings add column if not exists end_sun time not null default '16:00';
alter table public.school_settings add column if not exists end_mon time not null default '16:00';
alter table public.school_settings add column if not exists end_tue time not null default '14:00';
alter table public.school_settings add column if not exists end_wed time not null default '16:00';
alter table public.school_settings add column if not exists end_thu time not null default '16:00';
alter table public.school_settings add column if not exists end_fri time not null default '12:00';
alter table public.school_settings add column if not exists end_sat time;

grant select (end_sun, end_mon, end_tue, end_wed, end_thu, end_fri, end_sat),
      update (end_sun, end_mon, end_tue, end_wed, end_thu, end_fri, end_sat)
  on public.school_settings to authenticated;

create or replace function public.default_release_at(marked timestamptz, minutes integer)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  local_ts timestamp;
  weekday int;
  end_clock time;
  day_end timestamptz;
  start_at timestamptz;
begin
  if minutes is null or minutes < 1 or minutes > 240 then
    raise exception 'משך ההשארות אינו תקין';
  end if;
  local_ts := timezone('Asia/Jerusalem', marked);
  weekday := extract(dow from local_ts)::int;
  select case weekday
    when 0 then s.end_sun
    when 1 then s.end_mon
    when 2 then s.end_tue
    when 3 then s.end_wed
    when 4 then s.end_thu
    when 5 then s.end_fri
    else s.end_sat
  end
  into end_clock
  from public.school_settings s
  where s.id = 1;
  if end_clock is null then
    raise exception 'אין לימודים ביום זה';
  end if;
  day_end := (local_ts::date + end_clock) at time zone 'Asia/Jerusalem';
  if marked > day_end then
    start_at := marked;
  else
    start_at := day_end;
  end if;
  return start_at + make_interval(mins => minutes);
end;
$$;

grant execute on function public.default_release_at(timestamptz, integer) to authenticated;
revoke all on function public.default_release_at(timestamptz, integer) from public, anon;

create or replace function public.detentions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  official_label text;
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
  if new.release_at is null then
    new.release_at := public.default_release_at(new.marked_at, new.duration_minutes);
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
      raise exception 'מזכירות יכולה לעדכן רק את שעות סיום הלימודים';
    end if;
  elsif auth.uid() is not null and not public.is_admin() then
    raise exception 'רק מנהל יכול לעדכן הגדרות';
  end if;
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
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists settings_update on public.school_settings;
create policy settings_update on public.school_settings
  for update to authenticated
  using (public.is_admin() or public.my_role() = 'secretary')
  with check (public.is_admin() or public.my_role() = 'secretary');
