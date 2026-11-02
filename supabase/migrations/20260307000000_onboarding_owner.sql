-- Role requests, report scope, and a single system owner.
-- Safe to paste again in the Supabase SQL editor.
-- The secretary may approve people and assign teacher, homeroom, or secretary.
-- Only an admin may grant or revoke admin, and the last admin cannot be removed.
-- The profile whose email matches 1003870383@% is the owner. Only that person
-- can change the owner profile, and only that person can transfer ownership.

alter table public.profiles add column if not exists requested_role public.user_role;
alter table public.profiles add column if not exists requested_class_ids uuid[] not null default '{}';
alter table public.profiles add column if not exists is_owner boolean not null default false;

alter table public.school_settings add column if not exists owner_id uuid references public.profiles (id);

do $$
begin
  alter table public.profiles add constraint profiles_requested_role_kind
    check (requested_role is null or requested_role in ('teacher', 'homeroom'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists profiles_one_owner on public.profiles ((true)) where is_owner;

update public.profiles
set is_owner = true
where id = (
  select p.id
  from public.profiles p
  where p.email ilike '1003870383@%'
  order by (p.role = 'admin') desc, p.created_at
  limit 1
)
and not exists (select 1 from public.profiles where is_owner);

update public.school_settings
set owner_id = (select id from public.profiles where is_owner limit 1)
where id = 1
  and owner_id is null
  and exists (select 1 from public.profiles where is_owner);

grant select (requested_role, requested_class_ids, is_owner)
  on public.profiles to authenticated;
grant select (owner_id) on public.school_settings to authenticated;

create or replace function public.profiles_claim_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email ilike '1003870383@%'
     and not exists (
       select 1 from public.profiles p where p.is_owner and p.id is distinct from new.id
     ) then
    new.is_owner := true;
    if new.role is null then
      new.role := 'admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_claim_owner_trg on public.profiles;
create trigger profiles_claim_owner_trg
  before insert on public.profiles
  for each row execute function public.profiles_claim_owner();

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

  if old.is_owner and auth.uid() is not null and auth.uid() is distinct from old.id then
    if new.role is distinct from old.role
      or new.full_name is distinct from old.full_name
      or new.phone is distinct from old.phone
      or new.email is distinct from old.email
      or new.is_owner is distinct from old.is_owner
      or new.requested_role is distinct from old.requested_role
      or new.requested_class_ids is distinct from old.requested_class_ids
    then
      raise exception 'רק בעל המערכת יכול לשנות את הפרופיל שלו';
    end if;
  end if;

  new.email := old.email;

  if old.is_owner and new.role is distinct from 'admin' then
    raise exception 'בעל המערכת נשאר מנהל';
  end if;

  if new.is_owner is distinct from old.is_owner
     and coalesce(current_setting('hishaarut.transfer_owner', true), '') is distinct from '1' then
    if auth.uid() is not null then
      raise exception 'רק בעל המערכת יכול להעביר בעלות';
    end if;
  end if;

  if new.role is distinct from old.role then
    if auth.uid() is null or public.is_admin() then
      null;
    elsif public.my_role() = 'secretary' then
      if old.role = 'admin' or new.role = 'admin' then
        raise exception 'מזכירות לא יכולה למנות או לשנות מנהל';
      end if;
    else
      raise exception 'אין הרשאה לשנות תפקיד';
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

  if new.requested_role is distinct from old.requested_role
     or new.requested_class_ids is distinct from old.requested_class_ids then
    if auth.uid() is null or public.is_admin() or public.my_role() = 'secretary' then
      null;
    elsif auth.uid() = new.id
      and old.role is null
      and new.role is null
      and (new.requested_role is null or new.requested_role in ('teacher', 'homeroom')) then
      if new.requested_role is distinct from 'homeroom' then
        new.requested_class_ids := '{}';
      end if;
    else
      raise exception 'אי אפשר לקבוע תפקיד לבד';
    end if;
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

create or replace function public.profiles_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_owner then
    raise exception 'אי אפשר למחוק את בעל המערכת';
  end if;
  return old;
end;
$$;

drop trigger if exists profiles_before_delete_trg on public.profiles;
create trigger profiles_before_delete_trg
  before delete on public.profiles
  for each row execute function public.profiles_before_delete();

create or replace function public.list_open_classes()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name
  from public.classes c
  where c.active
    and public.caller_permitted()
  order by c.name;
$$;

create or replace function public.request_staff_role(p_role text, p_class_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned public.user_role;
begin
  if auth.uid() is null or not public.caller_permitted() then
    raise exception 'אין הרשאה לבקש תפקיד';
  end if;
  select p.role into assigned from public.profiles p where p.id = auth.uid();
  if assigned is not null then
    raise exception 'כבר יש תפקיד לחשבון';
  end if;
  if p_role not in ('teacher', 'homeroom') then
    raise exception 'אפשר לבקש רק מורה מקצועי או מחנך';
  end if;
  if p_role = 'homeroom' then
    if p_class_ids is null or cardinality(p_class_ids) < 1 then
      raise exception 'מחנך בוחר כיתה קיימת';
    end if;
    if exists (
      select 1
      from unnest(p_class_ids) as cid
      where not exists (select 1 from public.classes c where c.id = cid and c.active)
    ) then
      raise exception 'הכיתה לא נמצאה';
    end if;
  else
    p_class_ids := '{}';
  end if;
  update public.profiles
  set requested_role = p_role::public.user_role,
      requested_class_ids = coalesce(p_class_ids, '{}')
  where id = auth.uid();
end;
$$;

create or replace function public.can_manage_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.caller_permitted()
    and public.my_role() in ('secretary', 'admin')
$$;

create or replace function public.approve_staff_request(p_id uuid, p_role text, p_class_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if not public.can_manage_staff() then
    raise exception 'רק מנהל או מזכירות יכולים לאשר תפקיד';
  end if;
  if p_role not in ('teacher', 'homeroom', 'secretary', 'admin') then
    raise exception 'תפקיד לא תקין';
  end if;
  if p_role = 'admin' and not public.is_admin() then
    raise exception 'מזכירות לא יכולה למנות או לשנות מנהל';
  end if;
  select * into target from public.profiles where id = p_id;
  if target.id is null then
    raise exception 'המשתמש לא נמצא';
  end if;
  if target.is_owner and auth.uid() is distinct from target.id then
    raise exception 'רק בעל המערכת יכול לשנות את הפרופיל שלו';
  end if;
  if target.role = 'admin' and not public.is_admin() then
    raise exception 'מזכירות לא יכולה למנות או לשנות מנהל';
  end if;
  if p_role = 'homeroom' then
    if p_class_ids is null or cardinality(p_class_ids) < 1 then
      raise exception 'מחנך צריך כיתה';
    end if;
    if exists (
      select 1
      from unnest(p_class_ids) as cid
      where not exists (select 1 from public.classes c where c.id = cid)
    ) then
      raise exception 'הכיתה לא נמצאה';
    end if;
  else
    p_class_ids := '{}';
  end if;

  update public.profiles
  set role = p_role::public.user_role,
      requested_role = null,
      requested_class_ids = '{}'
  where id = p_id;

  if p_role = 'homeroom' then
    update public.classes
    set homeroom_teacher_id = null, updated_at = now()
    where homeroom_teacher_id = p_id
      and id <> all (p_class_ids);
    update public.classes
    set homeroom_teacher_id = p_id, updated_at = now()
    where id = any (p_class_ids);
  end if;
end;
$$;

create or replace function public.reject_staff_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_staff() then
    raise exception 'רק מנהל או מזכירות יכולים לאשר תפקיד';
  end if;
  if exists (select 1 from public.profiles where id = p_id and is_owner) then
    raise exception 'רק בעל המערכת יכול לשנות את הפרופיל שלו';
  end if;
  update public.profiles
  set requested_role = null,
      requested_class_ids = '{}'
  where id = p_id
    and role is null;
end;
$$;

create or replace function public.transfer_ownership(p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.profiles where id = me and is_owner) then
    raise exception 'רק בעל המערכת יכול להעביר בעלות';
  end if;
  if p_new_owner is null or p_new_owner = me then
    raise exception 'בחרו מנהל אחר';
  end if;
  if (select role from public.profiles where id = p_new_owner) is distinct from 'admin' then
    raise exception 'אפשר להעביר בעלות רק למנהל';
  end if;
  perform set_config('hishaarut.transfer_owner', '1', true);
  update public.profiles set is_owner = false where id = me;
  update public.profiles set is_owner = true where id = p_new_owner;
  update public.school_settings set owner_id = p_new_owner, updated_at = now() where id = 1;
end;
$$;

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
  if public.my_role() not in ('homeroom', 'secretary', 'admin') then
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
    )
  order by d.detention_date desc, s.last_name;
end;
$$;

grant execute on function public.list_open_classes() to authenticated;
grant execute on function public.request_staff_role(text, uuid[]) to authenticated;
grant execute on function public.can_manage_staff() to authenticated;
grant execute on function public.approve_staff_request(uuid, text, uuid[]) to authenticated;
grant execute on function public.reject_staff_request(uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid) to authenticated;
grant execute on function public.list_report_detentions(date, date) to authenticated;

revoke all on function public.list_open_classes() from public, anon;
revoke all on function public.request_staff_role(text, uuid[]) from public, anon;
revoke all on function public.can_manage_staff() from public, anon;
revoke all on function public.approve_staff_request(uuid, text, uuid[]) from public, anon;
revoke all on function public.reject_staff_request(uuid) from public, anon;
revoke all on function public.transfer_ownership(uuid) from public, anon;
revoke all on function public.list_report_detentions(date, date) from public, anon;
