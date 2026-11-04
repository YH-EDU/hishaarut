-- Self-service: a teacher switches between teacher and homeroom (with one class);
-- admin/owner keeps the role and may only set/clear their own homeroom class.
-- Never grants admin/secretary. Run after 20260314000000_detention_edit_delete.sql.

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
    elsif coalesce(current_setting('hishaarut.self_teaching', true), '') = '1'
      and auth.uid() = old.id
      and old.role in ('teacher', 'homeroom')
      and new.role in ('teacher', 'homeroom') then
      -- set_my_teaching: a teacher toggles only between מורה מקצועי and מחנך.
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

create or replace function public.set_my_teaching(p_role text, p_class_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_wants_class boolean;
begin
  if v_uid is null then
    raise exception 'יש להתחבר';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null or v_role not in ('teacher', 'homeroom', 'admin') then
    raise exception 'אין הרשאה לשנות תפקיד';
  end if;
  if p_role is null or p_role not in ('teacher', 'homeroom') then
    raise exception 'אפשר לבחור רק מורה מקצועי או מחנך';
  end if;

  v_wants_class := case when v_role = 'admin' then p_class_id is not null else p_role = 'homeroom' end;
  if v_wants_class and not exists (
    select 1 from public.classes c where c.id = p_class_id and c.active
  ) then
    raise exception 'מחנך בוחר כיתה אחת קיימת';
  end if;

  if v_role <> 'admin' and p_role is distinct from v_role then
    perform set_config('hishaarut.self_teaching', '1', true);
    update public.profiles set role = p_role::public.user_role where id = v_uid;
    perform set_config('hishaarut.self_teaching', '', true);
  end if;

  update public.classes
  set homeroom_teacher_id = null, updated_at = now()
  where homeroom_teacher_id = v_uid and (not v_wants_class or id <> p_class_id);

  if v_wants_class then
    update public.classes
    set homeroom_teacher_id = v_uid, updated_at = now()
    where id = p_class_id;
  end if;
end;
$$;

revoke all on function public.set_my_teaching(text, uuid) from public, anon;
grant execute on function public.set_my_teaching(text, uuid) to authenticated;

notify pgrst, 'reload schema';
