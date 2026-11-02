-- A second phone per parent, and a per-number "no WhatsApp" flag.
-- Phones stay off the table API. list_student_contacts returns them only to
-- homeroom, secretary, and admin. Only secretary and admin can change the flag.
-- Safe to paste again in the Supabase SQL editor.

alter table public.students add column if not exists parent_phone_2 text;
alter table public.students add column if not exists parent2_phone_2 text;
alter table public.students add column if not exists parent_phone_no_whatsapp boolean not null default false;
alter table public.students add column if not exists parent_phone_2_no_whatsapp boolean not null default false;
alter table public.students add column if not exists parent2_phone_no_whatsapp boolean not null default false;
alter table public.students add column if not exists parent2_phone_2_no_whatsapp boolean not null default false;

alter table public.notification_log add column if not exists fallback_phones text[] not null default '{}';

do $$
begin
  alter table public.students add constraint students_parent_phone_2_len
    check (parent_phone_2 is null or char_length(parent_phone_2) <= 30);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.students add constraint students_parent2_phone_2_len
    check (parent2_phone_2 is null or char_length(parent2_phone_2) <= 30);
exception when duplicate_object then null;
end $$;

revoke all (parent_phone_2, parent2_phone_2,
  parent_phone_no_whatsapp, parent_phone_2_no_whatsapp,
  parent2_phone_no_whatsapp, parent2_phone_2_no_whatsapp)
  on public.students from public, anon, authenticated;

grant insert (parent_phone_2, parent2_phone_2),
      update (parent_phone_2, parent2_phone_2)
  on public.students to authenticated;

create or replace function public.students_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.first_name := trim(new.first_name);
  new.last_name := trim(new.last_name);
  if new.parent_name is not null then
    new.parent_name := nullif(trim(new.parent_name), '');
  end if;
  if new.parent_phone is not null then
    new.parent_phone := nullif(trim(new.parent_phone), '');
  end if;
  if new.parent_phone_2 is not null then
    new.parent_phone_2 := nullif(trim(new.parent_phone_2), '');
  end if;
  if new.parent2_name is not null then
    new.parent2_name := nullif(trim(new.parent2_name), '');
  end if;
  if new.parent2_phone is not null then
    new.parent2_phone := nullif(trim(new.parent2_phone), '');
  end if;
  if new.parent2_phone_2 is not null then
    new.parent2_phone_2 := nullif(trim(new.parent2_phone_2), '');
  end if;
  if new.national_id is not null then
    new.national_id := nullif(regexp_replace(new.national_id, '\s', '', 'g'), '');
  end if;

  if tg_op = 'UPDATE'
    and auth.uid() is not null
    and not public.can_manage_operations()
    and (
      new.parent_phone_no_whatsapp is distinct from old.parent_phone_no_whatsapp
      or new.parent_phone_2_no_whatsapp is distinct from old.parent_phone_2_no_whatsapp
      or new.parent2_phone_no_whatsapp is distinct from old.parent2_phone_no_whatsapp
      or new.parent2_phone_2_no_whatsapp is distinct from old.parent2_phone_2_no_whatsapp
    )
  then
    raise exception 'רק מזכירות יכולה לסמן שאין וואטסאפ';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

-- Numbers that automatic WhatsApp may try, in order. Flagged numbers are skipped.
-- The first entry is the primary; the rest are the delivery fallback.
create or replace function public.ordered_parent_phones(
  p1 text, p1b text, p2 text, p2b text,
  f1 boolean, f1b boolean, f2 boolean, f2b boolean
)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(phone order by ord), '{}'::text[])
  from (
    select public.normalize_phone_il(p1) as phone, coalesce(f1, false) as blocked, 1 as ord
    union all
    select public.normalize_phone_il(p1b), coalesce(f1b, false), 2
    union all
    select public.normalize_phone_il(p2), coalesce(f2, false), 3
    union all
    select public.normalize_phone_il(p2b), coalesce(f2b, false), 4
  ) s
  where phone is not null and not blocked
$$;

drop function if exists public.list_student_contacts();
create function public.list_student_contacts()
returns table (
  student_id uuid,
  parent_name text,
  parent_phone text,
  parent_phone_2 text,
  parent_phone_no_whatsapp boolean,
  parent_phone_2_no_whatsapp boolean,
  parent2_name text,
  parent2_phone text,
  parent2_phone_2 text,
  parent2_phone_no_whatsapp boolean,
  parent2_phone_2_no_whatsapp boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.parent_name,
    s.parent_phone,
    s.parent_phone_2,
    s.parent_phone_no_whatsapp,
    s.parent_phone_2_no_whatsapp,
    s.parent2_name,
    s.parent2_phone,
    s.parent2_phone_2,
    s.parent2_phone_no_whatsapp,
    s.parent2_phone_2_no_whatsapp
  from public.students s
  where public.can_view_student_contact(s.class_id)
$$;

grant execute on function public.list_student_contacts() to authenticated;
revoke all on function public.list_student_contacts() from public, anon;

create or replace function public.set_student_whatsapp_opt_out(
  p_student_id uuid,
  p_slot text,
  p_no_whatsapp boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_operations() then
    raise exception 'רק מזכירות יכולה לסמן שאין וואטסאפ';
  end if;
  if p_slot = 'parent1' then
    update public.students set parent_phone_no_whatsapp = p_no_whatsapp where id = p_student_id;
  elsif p_slot = 'parent1b' then
    update public.students set parent_phone_2_no_whatsapp = p_no_whatsapp where id = p_student_id;
  elsif p_slot = 'parent2' then
    update public.students set parent2_phone_no_whatsapp = p_no_whatsapp where id = p_student_id;
  elsif p_slot = 'parent2b' then
    update public.students set parent2_phone_2_no_whatsapp = p_no_whatsapp where id = p_student_id;
  else
    raise exception 'מספר לא מוכר';
  end if;
  if not found then
    raise exception 'התלמיד לא נמצא';
  end if;
end;
$$;

grant execute on function public.set_student_whatsapp_opt_out(uuid, text, boolean) to authenticated;
revoke all on function public.set_student_whatsapp_opt_out(uuid, text, boolean) from public, anon;

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
  mode text;
  channel public.notification_channel;
  student_name text;
  phones text[];
  parent_phone text;
  fallbacks text[];
  homeroom_phone text;
  parent_status public.notification_status;
  homeroom_status public.notification_status;
  parent_error text;
  homeroom_error text;
  parent_label text;
  any_raw boolean;
  any_valid boolean;
begin
  select
    dt.id,
    dt.reason_text,
    dt.duration_minutes,
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

  select ss.school_name, ss.notification_mode
  into school, mode
  from public.school_settings ss
  where ss.id = 1;

  school := coalesce(nullif(trim(school), ''), 'בית הספר');
  channel := case
    when mode = 'cloud_api' then 'whatsapp_cloud'::public.notification_channel
    else 'whatsapp_link'::public.notification_channel
  end;
  student_name := trim(d.first_name) || ' ' || trim(d.last_name);

  phones := public.ordered_parent_phones(
    d.raw_parent_phone, d.raw_parent_phone_2, d.raw_parent2_phone, d.raw_parent2_phone_2,
    d.parent_phone_no_whatsapp, d.parent_phone_2_no_whatsapp,
    d.parent2_phone_no_whatsapp, d.parent2_phone_2_no_whatsapp
  );
  parent_label := nullif(trim(coalesce(d.parent_name, '')), '');
  any_raw := nullif(trim(coalesce(d.raw_parent_phone, '')), '') is not null
    or nullif(trim(coalesce(d.raw_parent_phone_2, '')), '') is not null
    or nullif(trim(coalesce(d.raw_parent2_phone, '')), '') is not null
    or nullif(trim(coalesce(d.raw_parent2_phone_2, '')), '') is not null;
  any_valid := public.normalize_phone_il(d.raw_parent_phone) is not null
    or public.normalize_phone_il(d.raw_parent_phone_2) is not null
    or public.normalize_phone_il(d.raw_parent2_phone) is not null
    or public.normalize_phone_il(d.raw_parent2_phone_2) is not null;

  if cardinality(phones) = 0 then
    parent_phone := null;
    fallbacks := '{}';
    parent_status := 'skipped';
    parent_error := case
      when not any_raw then 'no_phone'
      when any_valid then 'no_whatsapp'
      else 'invalid_phone'
    end;
  else
    parent_phone := phones[1];
    fallbacks := phones[2:cardinality(phones)];
    parent_status := 'pending';
    parent_error := null;
    if public.normalize_phone_il(d.raw_parent_phone) is distinct from parent_phone
      and public.normalize_phone_il(d.raw_parent_phone_2) is distinct from parent_phone
    then
      parent_label := coalesce(nullif(trim(coalesce(d.parent2_name, '')), ''), parent_label);
    end if;
  end if;

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
    detention_id, event, recipient_type, channel,
    recipient_phone, fallback_phones, recipient_label, message_body, status, error_text
  )
  values
    (
      d.id, p_event, 'parent', channel, parent_phone, fallbacks,
      coalesce(parent_label, 'הורה'),
      public.render_detention_message(
        p_event, 'parent', d.gender, student_name, d.class_name,
        d.reason_text, d.duration_minutes, school, d.marker_name
      ),
      parent_status, parent_error
    ),
    (
      d.id, p_event, 'homeroom', channel, homeroom_phone, '{}',
      coalesce(nullif(trim(d.homeroom_name), ''), 'מחנך/ת'),
      public.render_detention_message(
        p_event, 'homeroom', d.gender, student_name, d.class_name,
        d.reason_text, d.duration_minutes, school, d.marker_name
      ),
      homeroom_status, homeroom_error
    )
  on conflict (detention_id, event, recipient_type) do nothing;
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

drop function if exists public.list_notification_dispatch(date);
create function public.list_notification_dispatch(p_date date)
returns table (
  id uuid,
  detention_id uuid,
  event public.notification_event,
  recipient_type public.notification_recipient,
  channel public.notification_channel,
  recipient_phone text,
  fallback_phones text[],
  recipient_label text,
  message_body text,
  status public.notification_status,
  sent_at timestamptz,
  error_text text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_sign() then
    raise exception 'אין הרשאה לצפות בפרטי קשר';
  end if;

  return query
  select
    n.id,
    n.detention_id,
    n.event,
    n.recipient_type,
    n.channel,
    n.recipient_phone,
    n.fallback_phones,
    n.recipient_label,
    n.message_body,
    n.status,
    n.sent_at,
    n.error_text
  from public.notification_log n
  join public.detentions d on d.id = n.detention_id
  where d.detention_date = p_date;
end;
$$;

grant execute on function public.list_notification_dispatch(date) to authenticated;
revoke all on function public.list_notification_dispatch(date) from public, anon;
