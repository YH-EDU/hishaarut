-- השארות — schema, audit fields, and row level security.
-- Run this file once in the Supabase SQL editor (or via the Supabase CLI).
-- The anon key may ship in the client. These policies are the security boundary.
-- Do not FORCE row level security: the auth trigger and SECURITY DEFINER
-- helpers are owned by the migration role and must bypass RLS. Forcing it
-- would recurse inside my_role() and break sign-up.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('teacher', 'homeroom', 'secretary', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'detention_status') then
    create type public.detention_status as enum ('pending', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'student_gender') then
    create type public.student_gender as enum ('male', 'female');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_event') then
    create type public.notification_event as enum ('marked', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_recipient') then
    create type public.notification_recipient as enum ('parent', 'homeroom');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('whatsapp_link', 'whatsapp_cloud');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  role public.user_role,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_len check (char_length(full_name) <= 120),
  constraint profiles_phone_len check (phone is null or char_length(phone) <= 30)
);

create table if not exists public.school_settings (
  id integer primary key default 1,
  school_name text not null default 'בית הספר',
  allowed_email_domain text,
  -- manual_link: secretary sends from the school WhatsApp Business app via wa.me.
  -- cloud_api: reserved for phase 2. The sender is not implemented; the token
  -- must never be stored in this table or in the client.
  notification_mode text not null default 'manual_link',
  whatsapp_phone_number_id text,
  whatsapp_display_number text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint school_settings_singleton check (id = 1),
  constraint school_settings_mode check (notification_mode in ('manual_link', 'cloud_api')),
  constraint school_settings_name_len check (char_length(school_name) between 1 and 120)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  grade text,
  homeroom_teacher_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_name_len check (char_length(name) between 1 and 40)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  gender public.student_gender,
  class_id uuid not null references public.classes (id) on delete restrict,
  parent_name text,
  parent_phone text,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_unique_name unique (class_id, first_name, last_name),
  constraint students_first_len check (char_length(first_name) between 1 and 50),
  constraint students_last_len check (char_length(last_name) between 1 and 50),
  constraint students_parent_name_len check (parent_name is null or char_length(parent_name) <= 120),
  constraint students_parent_phone_len check (parent_phone is null or char_length(parent_phone) <= 30)
);

create index if not exists students_class_idx on public.students (class_id);
create index if not exists students_name_idx on public.students (last_name, first_name);

create table if not exists public.detention_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint detention_reasons_label_len check (char_length(label) between 1 and 80)
);

create table if not exists public.detentions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  reason_id uuid references public.detention_reasons (id) on delete set null,
  reason_text text not null,
  duration_minutes integer not null,
  status public.detention_status not null default 'pending',
  detention_date date not null default ((timezone('Asia/Jerusalem', now()))::date),
  marked_by uuid not null references public.profiles (id),
  marked_at timestamptz not null default now(),
  signed_by uuid references public.profiles (id),
  signed_at timestamptz,
  completed_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint detentions_duration check (duration_minutes between 1 and 240),
  constraint detentions_reason_len check (char_length(reason_text) between 1 and 160),
  constraint detentions_notes_len check (notes is null or char_length(notes) <= 500)
);

create index if not exists detentions_date_idx on public.detentions (detention_date desc);
create index if not exists detentions_student_idx on public.detentions (student_id);
create index if not exists detentions_marked_by_idx on public.detentions (marked_by);
create index if not exists detentions_pending_date_idx
  on public.detentions (detention_date)
  where status = 'pending';

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  detention_id uuid not null references public.detentions (id) on delete cascade,
  event public.notification_event not null,
  recipient_type public.notification_recipient not null,
  channel public.notification_channel not null default 'whatsapp_link',
  recipient_phone text,
  recipient_label text,
  message_body text not null,
  status public.notification_status not null default 'pending',
  sent_by uuid references public.profiles (id),
  sent_at timestamptz,
  provider_message_id text,
  error_text text,
  created_at timestamptz not null default now(),
  constraint notification_log_unique unique (detention_id, event, recipient_type)
);

create index if not exists notification_log_detention_idx
  on public.notification_log (detention_id);

create table if not exists public.role_audit (
  id uuid primary key default gen_random_uuid(),
  target_user uuid not null references public.profiles (id) on delete cascade,
  old_role public.user_role,
  new_role public.user_role,
  changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

insert into public.school_settings (id, school_name)
values (1, 'בית הספר')
on conflict (id) do nothing;

insert into public.detention_reasons (label, sort_order)
values
  ('חיסור בתפילה', 10),
  ('הפרעה בשיעור', 20),
  ('היעדרות משיעור', 30)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so policies can read the caller's role without
-- recursively applying the profiles policy. search_path is pinned.
-- ---------------------------------------------------------------------------

create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() is not null
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() = 'admin'
$$;

create or replace function public.can_mark_detentions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() in ('teacher', 'homeroom', 'secretary', 'admin')
$$;

create or replace function public.can_sign()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() in ('secretary', 'admin')
$$;

create or replace function public.manages_class(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or (
      public.my_role() = 'homeroom'
      and exists (
        select 1
        from public.classes c
        where c.id = cid
          and c.homeroom_teacher_id = auth.uid()
      )
    )
$$;

-- Parent phones are visible to the secretary, the admin, and the homeroom
-- teacher of that class. Subject teachers can see every student and mark
-- detentions, but not parent phone numbers.
create or replace function public.can_view_student_contact(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.my_role() = 'secretary'
    or (
      public.my_role() = 'homeroom'
      and exists (
        select 1
        from public.classes c
        where c.id = cid
          and c.homeroom_teacher_id = auth.uid()
      )
    )
$$;

create or replace function public.normalize_phone_il(raw text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if raw is null then
    return null;
  end if;
  d := regexp_replace(raw, '[^0-9]', '', 'g');
  if d = '' then
    return null;
  end if;
  if d like '9720%' then
    d := '972' || substring(d from 5);
  end if;
  if d like '972%' then
    if char_length(d) < 11 or char_length(d) > 13 then
      return null;
    end if;
    return d;
  end if;
  if d like '0%' and (char_length(d) = 9 or char_length(d) = 10) then
    return '972' || substring(d from 2);
  end if;
  if char_length(d) = 9 and d like '5%' then
    return '972' || d;
  end if;
  return null;
end;
$$;

create or replace function public.render_detention_message(
  p_event public.notification_event,
  p_audience public.notification_recipient,
  p_gender public.student_gender,
  p_student_name text,
  p_class_name text,
  p_reason text,
  p_minutes integer,
  p_school text,
  p_marker_name text
)
returns text
language plpgsql
immutable
as $$
declare
  stay_word text;
  finish_word text;
  who text;
begin
  if p_gender = 'female' then
    stay_word := 'נשארה';
    finish_word := 'סיימה את ההשארות והיא בדרכה הביתה';
  elsif p_gender = 'male' then
    stay_word := 'נשאר';
    finish_word := 'סיים את ההשארות והוא בדרכו הביתה';
  else
    stay_word := 'נשאר/ה';
    finish_word := 'סיים/ה את ההשארות ובדרך הביתה';
  end if;

  who := p_student_name;
  if p_audience = 'homeroom' and coalesce(p_class_name, '') <> '' then
    who := p_student_name || ' מכיתה ' || p_class_name;
  end if;

  if p_event = 'marked' then
    if p_audience = 'homeroom' and coalesce(p_marker_name, '') <> '' then
      return format(
        E'שלום, הודעה מ%s:\n%s %s היום אחרי שעות הלימודים.\nסיבה: %s\nמשך: %s דקות.\nסומן על ידי: %s.',
        p_school, who, stay_word, p_reason, p_minutes, p_marker_name
      );
    end if;
    return format(
      E'שלום, הודעה מ%s:\n%s %s היום אחרי שעות הלימודים.\nסיבה: %s\nמשך: %s דקות.',
      p_school, who, stay_word, p_reason, p_minutes
    );
  end if;

  return format(
    E'שלום, הודעה מ%s:\n%s %s.',
    p_school, who, finish_word
  );
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
  mode text;
  channel public.notification_channel;
  student_name text;
  parent_phone text;
  homeroom_phone text;
  parent_status public.notification_status;
  homeroom_status public.notification_status;
  parent_error text;
  homeroom_error text;
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

  parent_phone := public.normalize_phone_il(d.raw_parent_phone);
  if parent_phone is null then
    parent_status := 'skipped';
    parent_error := case
      when nullif(trim(coalesce(d.raw_parent_phone, '')), '') is null then 'no_phone'
      else 'invalid_phone'
    end;
  else
    parent_status := 'pending';
    parent_error := null;
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
    recipient_phone, recipient_label, message_body, status, error_text
  )
  values
    (
      d.id,
      p_event,
      'parent',
      channel,
      parent_phone,
      coalesce(nullif(trim(d.parent_name), ''), 'הורה'),
      public.render_detention_message(
        p_event, 'parent', d.gender, student_name, d.class_name,
        d.reason_text, d.duration_minutes, school, d.marker_name
      ),
      parent_status,
      parent_error
    ),
    (
      d.id,
      p_event,
      'homeroom',
      channel,
      homeroom_phone,
      coalesce(nullif(trim(d.homeroom_name), ''), 'מחנך/ת'),
      public.render_detention_message(
        p_event, 'homeroom', d.gender, student_name, d.class_name,
        d.reason_text, d.duration_minutes, school, d.marker_name
      ),
      homeroom_status,
      homeroom_error
    )
  on conflict (detention_id, event, recipient_type) do nothing;
end;
$$;

-- Parent phones and homeroom dispatch phones. Not a table grant: subject
-- teachers must not be able to select students.parent_phone.
create or replace function public.list_student_contacts()
returns table (
  student_id uuid,
  parent_name text,
  parent_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.parent_name, s.parent_phone
  from public.students s
  where public.can_view_student_contact(s.class_id)
$$;

create or replace function public.list_notification_dispatch(p_date date)
returns table (
  id uuid,
  detention_id uuid,
  event public.notification_event,
  recipient_type public.notification_recipient,
  channel public.notification_channel,
  recipient_phone text,
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

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text;
  domain text;
  uname text;
  normalized_email text;
begin
  select allowed_email_domain into allowed from public.school_settings where id = 1;
  normalized_email := lower(trim(coalesce(new.email, '')));
  domain := split_part(normalized_email, '@', 2);

  if allowed is not null and length(trim(allowed)) > 0 and domain <> lower(trim(allowed)) then
    raise exception 'הדומיין של חשבון הגוגל אינו מורשה בבית הספר';
  end if;

  uname := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    split_part(normalized_email, '@', 1)
  );

  insert into public.profiles (id, email, full_name)
  values (new.id, normalized_email, coalesce(uname, ''))
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'אי אפשר לשנות מזהה משתמש';
  end if;

  new.email := old.email;

  if new.role is distinct from old.role then
    -- auth.uid() is null for the SQL editor and the service role. That is the
    -- bootstrap path for the first admin. Signed-in users must already be admin.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'רק מנהל יכול לשנות תפקיד';
    end if;
    if old.role = 'admin' and new.role is distinct from 'admin' then
      if (
        select count(*)
        from public.profiles p
        where p.role = 'admin' and p.id <> old.id
      ) < 1 then
        raise exception 'אי אפשר להסיר את המנהל האחרון';
      end if;
    end if;
    insert into public.role_audit (target_user, old_role, new_role, changed_by)
    values (old.id, old.role, new.role, auth.uid());
  end if;

  if new.role is distinct from 'homeroom' then
    update public.classes
    set homeroom_teacher_id = null, updated_at = now()
    where homeroom_teacher_id = new.id;
  end if;

  new.full_name := trim(coalesce(new.full_name, ''));
  if new.phone is not null then
    new.phone := nullif(trim(new.phone), '');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

create or replace function public.classes_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.name := trim(new.name);
  if new.grade is not null then
    new.grade := nullif(trim(new.grade), '');
  end if;
  if new.homeroom_teacher_id is not null then
    if (
      select p.role from public.profiles p where p.id = new.homeroom_teacher_id
    ) is distinct from 'homeroom' then
      raise exception 'מחנך הכיתה חייב להיות משתמש בתפקיד מחנך';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists classes_before_write_trg on public.classes;
create trigger classes_before_write_trg
  before insert or update on public.classes
  for each row execute function public.classes_before_write();

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
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists students_before_write_trg on public.students;
create trigger students_before_write_trg
  before insert or update on public.students
  for each row execute function public.students_before_write();

create or replace function public.reasons_before_write()
returns trigger
language plpgsql
as $$
begin
  new.label := trim(new.label);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reasons_before_write_trg on public.detention_reasons;
create trigger reasons_before_write_trg
  before insert or update on public.detention_reasons
  for each row execute function public.reasons_before_write();

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
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.detentions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notifications(new.id, 'marked');
  return new;
end;
$$;

create or replace function public.detentions_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.student_id is distinct from old.student_id
    or new.reason_id is distinct from old.reason_id
    or new.reason_text is distinct from old.reason_text
    or new.duration_minutes is distinct from old.duration_minutes
    or new.marked_by is distinct from old.marked_by
    or new.marked_at is distinct from old.marked_at
    or new.detention_date is distinct from old.detention_date
    or new.notes is distinct from old.notes
    or new.created_at is distinct from old.created_at
  then
    raise exception 'אי אפשר לשנות פרטי השארות';
  end if;

  if new.status = 'completed' and old.status = 'pending' then
    if not public.can_sign() then
      raise exception 'אין הרשאה לאשר סיום';
    end if;
    new.signed_by := auth.uid();
    new.signed_at := now();
    new.completed_at := now();
  elsif new.status = 'cancelled' and old.status = 'pending' then
    if not (public.can_sign() or old.marked_by = auth.uid()) then
      raise exception 'אין הרשאה לבטל';
    end if;
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
  elsif new.status is distinct from old.status then
    raise exception 'מעבר סטטוס אינו חוקי';
  else
    new.signed_by := old.signed_by;
    new.signed_at := old.signed_at;
    new.completed_at := old.completed_at;
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
  end if;

  if new.status = 'completed' and old.status = 'pending' then
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
  elsif new.status = 'cancelled' and old.status = 'pending' then
    new.signed_by := old.signed_by;
    new.signed_at := old.signed_at;
    new.completed_at := old.completed_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.detentions_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status = 'pending' then
    perform public.enqueue_notifications(new.id, 'completed');
  end if;
  return new;
end;
$$;

drop trigger if exists detentions_before_insert_trg on public.detentions;
create trigger detentions_before_insert_trg
  before insert on public.detentions
  for each row execute function public.detentions_before_insert();

drop trigger if exists detentions_after_insert_trg on public.detentions;
create trigger detentions_after_insert_trg
  after insert on public.detentions
  for each row execute function public.detentions_after_insert();

drop trigger if exists detentions_before_update_trg on public.detentions;
create trigger detentions_before_update_trg
  before update on public.detentions
  for each row execute function public.detentions_before_update();

drop trigger if exists detentions_after_update_trg on public.detentions;
create trigger detentions_after_update_trg
  after update on public.detentions
  for each row execute function public.detentions_after_update();

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

drop trigger if exists notification_log_protect on public.notification_log;
create trigger notification_log_protect
  before update on public.notification_log
  for each row execute function public.protect_notification_update();

create or replace function public.school_settings_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'רק מנהל יכול לעדכן הגדרות';
  end if;
  new.id := 1;
  new.school_name := trim(new.school_name);
  if new.allowed_email_domain is not null then
    new.allowed_email_domain := nullif(lower(trim(new.allowed_email_domain)), '');
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

drop trigger if exists school_settings_before_update_trg on public.school_settings;
create trigger school_settings_before_update_trg
  before update on public.school_settings
  for each row execute function public.school_settings_before_update();

-- ---------------------------------------------------------------------------
-- Privileges. Column grants keep parent phones off the students table API.
-- ---------------------------------------------------------------------------

revoke all on public.profiles from public, anon, authenticated;
revoke all on public.school_settings from public, anon, authenticated;
revoke all on public.classes from public, anon, authenticated;
revoke all on public.students from public, anon, authenticated;
revoke all on public.detention_reasons from public, anon, authenticated;
revoke all on public.detentions from public, anon, authenticated;
revoke all on public.notification_log from public, anon, authenticated;
revoke all on public.role_audit from public, anon, authenticated;

grant select (id, email, full_name, phone, role, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, phone, role)
  on public.profiles to authenticated;

grant select (
  id, school_name, allowed_email_domain, notification_mode,
  whatsapp_phone_number_id, whatsapp_display_number, updated_at
) on public.school_settings to authenticated;
grant update (
  school_name, allowed_email_domain, notification_mode,
  whatsapp_phone_number_id, whatsapp_display_number
) on public.school_settings to authenticated;

grant select (id, name, grade, homeroom_teacher_id, active, created_at, updated_at)
  on public.classes to authenticated;
grant insert (name, grade, homeroom_teacher_id, active)
  on public.classes to authenticated;
grant update (name, grade, homeroom_teacher_id, active)
  on public.classes to authenticated;
grant delete on public.classes to authenticated;

-- No select/insert/update of parent_phone or parent_name for the table API.
grant select (id, first_name, last_name, gender, class_id, active, created_at, updated_at)
  on public.students to authenticated;
grant insert (first_name, last_name, gender, class_id, parent_name, parent_phone, active)
  on public.students to authenticated;
grant update (first_name, last_name, gender, class_id, parent_name, parent_phone, active)
  on public.students to authenticated;
grant delete on public.students to authenticated;

grant select (id, label, active, sort_order, created_at, updated_at)
  on public.detention_reasons to authenticated;
grant insert (label, active, sort_order)
  on public.detention_reasons to authenticated;
grant update (label, active, sort_order)
  on public.detention_reasons to authenticated;
grant delete on public.detention_reasons to authenticated;

grant select (
  id, student_id, reason_id, reason_text, duration_minutes, status, detention_date,
  marked_by, marked_at, signed_by, signed_at, completed_at, cancelled_by, cancelled_at,
  notes, created_at, updated_at
) on public.detentions to authenticated;
grant insert (student_id, reason_id, reason_text, duration_minutes, notes)
  on public.detentions to authenticated;
grant update (status)
  on public.detentions to authenticated;

-- recipient_phone is intentionally not granted. Secretary reads it via
-- list_notification_dispatch().
grant select (
  id, detention_id, event, recipient_type, channel, recipient_label,
  message_body, status, sent_by, sent_at, error_text, created_at
) on public.notification_log to authenticated;
grant update (status)
  on public.notification_log to authenticated;

grant select (id, target_user, old_role, new_role, changed_by, created_at)
  on public.role_audit to authenticated;

-- enqueue_notifications is an internal writer. Trigger functions stay
-- executable: PostgreSQL checks EXECUTE when a trigger fires, and a trigger
-- function cannot be called as a normal RPC.
revoke all on function public.enqueue_notifications(uuid, public.notification_event) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

grant execute on function public.my_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_mark_detentions() to authenticated;
grant execute on function public.can_sign() to authenticated;
grant execute on function public.manages_class(uuid) to authenticated;
grant execute on function public.can_view_student_contact(uuid) to authenticated;
grant execute on function public.normalize_phone_il(text) to authenticated;
grant execute on function public.render_detention_message(
  public.notification_event,
  public.notification_recipient,
  public.student_gender,
  text, text, text, integer, text, text
) to authenticated;
grant execute on function public.list_student_contacts() to authenticated;
grant execute on function public.list_notification_dispatch(date) to authenticated;

revoke all on function public.my_role() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.can_mark_detentions() from public, anon;
revoke all on function public.can_sign() from public, anon;
revoke all on function public.manages_class(uuid) from public, anon;
revoke all on function public.can_view_student_contact(uuid) from public, anon;
revoke all on function public.normalize_phone_il(text) from public, anon;
revoke all on function public.render_detention_message(
  public.notification_event,
  public.notification_recipient,
  public.student_gender,
  text, text, text, integer, text, text
) from public, anon;
revoke all on function public.list_student_contacts() from public, anon;
revoke all on function public.list_notification_dispatch(date) from public, anon;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.school_settings enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.detention_reasons enable row level security;
alter table public.detentions enable row level security;
alter table public.notification_log enable row level security;
alter table public.role_audit enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists settings_select on public.school_settings;
create policy settings_select on public.school_settings
  for select to authenticated
  using (public.is_staff());

drop policy if exists settings_update on public.school_settings;
create policy settings_update on public.school_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes
  for select to authenticated
  using (public.is_staff());

drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes
  for delete to authenticated
  using (public.is_admin());

drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated
  using (public.is_staff());

drop policy if exists students_insert on public.students;
create policy students_insert on public.students
  for insert to authenticated
  with check (public.manages_class(class_id));

drop policy if exists students_update on public.students;
create policy students_update on public.students
  for update to authenticated
  using (public.manages_class(class_id))
  with check (public.manages_class(class_id));

drop policy if exists students_delete on public.students;
create policy students_delete on public.students
  for delete to authenticated
  using (public.is_admin());

drop policy if exists reasons_select on public.detention_reasons;
create policy reasons_select on public.detention_reasons
  for select to authenticated
  using (public.is_staff());

drop policy if exists reasons_write on public.detention_reasons;
create policy reasons_write on public.detention_reasons
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists detentions_select on public.detentions;
create policy detentions_select on public.detentions
  for select to authenticated
  using (public.is_staff());

drop policy if exists detentions_insert on public.detentions;
create policy detentions_insert on public.detentions
  for insert to authenticated
  with check (
    public.can_mark_detentions()
    and marked_by = auth.uid()
    and status = 'pending'
  );

drop policy if exists detentions_update on public.detentions;
create policy detentions_update on public.detentions
  for update to authenticated
  using (
    public.can_sign()
    or (marked_by = auth.uid() and status = 'pending')
  )
  with check (
    public.can_sign()
    or (marked_by = auth.uid() and status = 'cancelled')
  );

drop policy if exists notifications_select on public.notification_log;
create policy notifications_select on public.notification_log
  for select to authenticated
  using (public.is_staff());

drop policy if exists notifications_update on public.notification_log;
create policy notifications_update on public.notification_log
  for update to authenticated
  using (public.can_sign())
  with check (public.can_sign());

drop policy if exists role_audit_select on public.role_audit;
create policy role_audit_select on public.role_audit
  for select to authenticated
  using (public.is_admin());

-- Realtime for the secretary dashboard. Ignored outside Supabase.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.detentions;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.notification_log;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
