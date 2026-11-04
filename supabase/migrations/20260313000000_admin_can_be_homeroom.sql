-- Owner (or any admin) may also be the homeroom teacher of a class, so one
-- account can be "בעלים" + מחנך. Owner protections are unchanged.
-- Title becomes optional at sign-up (used only in the parent WhatsApp signature).
-- Idempotent; safe to re-run. Run AFTER 20260312000000.

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
    ) not in ('homeroom', 'admin') then
      raise exception 'מחנך הכיתה חייב להיות משתמש בתפקיד מחנך או מנהל';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
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
      and (new.requested_role is null or new.requested_role in ('teacher', 'homeroom', 'secretary', 'admin')) then
      if new.requested_role is distinct from 'homeroom' then
        new.requested_class_ids := '{}';
      end if;
    else
      raise exception 'אי אפשר לקבוע תפקיד לבד';
    end if;
  end if;

  if new.role is null or new.role not in ('homeroom', 'admin') then
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

-- Title is optional.
create or replace function public.request_staff_role(p_role text, p_class_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
begin
  if auth.uid() is null or not public.caller_permitted() then
    raise exception 'אין הרשאה לבקש תפקיד';
  end if;
  select * into me from public.profiles p where p.id = auth.uid();
  if me.role is not null then
    raise exception 'כבר יש תפקיד לחשבון';
  end if;
  -- Any staff role may be REQUESTED; it is granted only by approve_staff_request
  -- (admin/secretary; admin role only by an admin).
  if p_role not in ('teacher', 'homeroom', 'secretary', 'admin') then
    raise exception 'תפקיד לא תקין';
  end if;
  if cardinality(regexp_split_to_array(btrim(coalesce(me.full_name, '')), '\s+')) < 2
     or btrim(coalesce(me.full_name, '')) = '' then
    raise exception 'צריך למלא שם פרטי ושם משפחה';
  end if;
  if p_role = 'homeroom' then
    if p_class_ids is null or cardinality(p_class_ids) <> 1 then
      raise exception 'מחנך בוחר כיתה אחת קיימת';
    end if;
    if not exists (select 1 from public.classes c where c.id = p_class_ids[1] and c.active) then
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
