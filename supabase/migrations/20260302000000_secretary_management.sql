-- Secretary day-to-day management.
-- Safe to paste again in the Supabase SQL editor after 20260301000000_init.sql.
-- A secretary can manage classes, students, parent phones, and staff roles,
-- but cannot grant, remove, or edit the admin role.

create or replace function public.can_manage_operations()
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
  select public.can_manage_operations()
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
    -- auth.uid() is null for the SQL editor and the service role.
    if auth.uid() is null or public.is_admin() then
      null;
    elsif public.my_role() = 'secretary' then
      if old.role = 'admin' or new.role = 'admin' then
        raise exception 'מזכירות לא יכולה למנות או לשנות מנהל';
      end if;
    else
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

grant execute on function public.can_manage_operations() to authenticated;
grant execute on function public.manages_class(uuid) to authenticated;
revoke all on function public.can_manage_operations() from public, anon;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.my_role() = 'secretary' and role is distinct from 'admin')
  )
  with check (
    id = auth.uid()
    or public.is_admin()
    or (public.my_role() = 'secretary' and role is distinct from 'admin')
  );

drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes
  for insert to authenticated
  with check (public.can_manage_operations());

drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes
  for update to authenticated
  using (public.can_manage_operations())
  with check (public.can_manage_operations());

-- Extra student fields for Mashov-style imports. Parent phones stay off the
-- table API; list_student_contacts returns them only to homeroom, secretary, admin.
alter table public.students add column if not exists national_id text;
alter table public.students add column if not exists parent2_name text;
alter table public.students add column if not exists parent2_phone text;

do $$
begin
  alter table public.students add constraint students_national_id_len
    check (national_id is null or char_length(national_id) <= 20);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.students add constraint students_parent2_name_len
    check (parent2_name is null or char_length(parent2_name) <= 120);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.students add constraint students_parent2_phone_len
    check (parent2_phone is null or char_length(parent2_phone) <= 30);
exception when duplicate_object then null;
end $$;

create unique index if not exists students_national_id_unique
  on public.students (national_id)
  where national_id is not null and national_id <> '';

grant insert (national_id, parent2_name, parent2_phone),
      update (national_id, parent2_name, parent2_phone)
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
  if new.parent2_name is not null then
    new.parent2_name := nullif(trim(new.parent2_name), '');
  end if;
  if new.parent2_phone is not null then
    new.parent2_phone := nullif(trim(new.parent2_phone), '');
  end if;
  if new.national_id is not null then
    new.national_id := nullif(regexp_replace(new.national_id, '\s', '', 'g'), '');
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

drop function if exists public.list_student_contacts();
create function public.list_student_contacts()
returns table (
  student_id uuid,
  parent_name text,
  parent_phone text,
  parent2_name text,
  parent2_phone text,
  national_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.parent_name, s.parent_phone, s.parent2_name, s.parent2_phone, s.national_id
  from public.students s
  where public.can_view_student_contact(s.class_id)
$$;

grant execute on function public.list_student_contacts() to authenticated;
revoke all on function public.list_student_contacts() from public, anon;

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
  parent_label text;
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
    s.parent2_name,
    s.parent2_phone as raw_parent2_phone,
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
  parent_label := nullif(trim(coalesce(d.parent_name, '')), '');
  if parent_phone is null then
    parent_phone := public.normalize_phone_il(d.raw_parent2_phone);
    if parent_phone is not null then
      parent_label := coalesce(nullif(trim(coalesce(d.parent2_name, '')), ''), parent_label);
    end if;
  end if;

  if parent_phone is null then
    parent_status := 'skipped';
    parent_error := case
      when nullif(trim(coalesce(d.raw_parent_phone, '')), '') is null
        and nullif(trim(coalesce(d.raw_parent2_phone, '')), '') is null then 'no_phone'
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
      d.id, p_event, 'parent', channel, parent_phone,
      coalesce(parent_label, 'הורה'),
      public.render_detention_message(
        p_event, 'parent', d.gender, student_name, d.class_name,
        d.reason_text, d.duration_minutes, school, d.marker_name
      ),
      parent_status, parent_error
    ),
    (
      d.id, p_event, 'homeroom', channel, homeroom_phone,
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
