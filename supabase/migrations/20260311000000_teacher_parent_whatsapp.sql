-- Teachers update parents directly from their own WhatsApp.
-- 1) get_detention_parent_phones: returns mother/father phones for a detention
--    only to the teacher who marked it (same day, not cancelled), or to staff
--    who can already view the student's contacts.
-- 2) The parent template comes from the teacher: reason as a sentence, exact
--    release time, no parent name. {reason_clause} and {teacher_sign} are new.
-- Safe to paste again in the Supabase SQL editor.

create or replace function public.get_detention_parent_phones(p_detention_id uuid)
returns table (mother_phone text, father_phone text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when coalesce(s.parent2_phone, '') <> '' and not s.parent2_phone_no_whatsapp then s.parent2_phone
         when coalesce(s.parent2_phone_2, '') <> '' and not s.parent2_phone_2_no_whatsapp then s.parent2_phone_2 end,
    case when coalesce(s.parent_phone, '') <> '' and not s.parent_phone_no_whatsapp then s.parent_phone
         when coalesce(s.parent_phone_2, '') <> '' and not s.parent_phone_2_no_whatsapp then s.parent_phone_2 end
  from public.detentions d
  join public.students s on s.id = d.student_id
  where d.id = p_detention_id
    and public.caller_permitted()
    and d.status <> 'cancelled'
    and (
      (d.marked_by = auth.uid() and d.detention_date = (timezone('Asia/Jerusalem', now()))::date)
      or public.can_view_student_contact(s.class_id)
    )
$$;

revoke all on function public.get_detention_parent_phones(uuid) from public, anon;
grant execute on function public.get_detention_parent_phones(uuid) to authenticated;

create or replace function public.default_parent_message_template()
returns text
language sql
immutable
as $$
  select E'שלום,\nהריני לעדכן ש{reason_clause} עד השעה {release_time}.\nתודה{teacher_sign}'
$$;

-- Mirror of reasonClause in src/lib/messages.ts.
create or replace function public.parent_reason_clause(p_student_name text, p_reason text)
returns text
language plpgsql
immutable
as $$
declare
  r text := regexp_replace(btrim(coalesce(p_reason, '')), '[.\s]+$', '');
  phrase text;
  who text := coalesce(p_student_name, '');
begin
  phrase := case r
    when 'חיסור בתפילה' then 'חיסר בתפילה'
    when 'חיסור מתפילה' then 'חיסר בתפילה'
    when 'הפרעה בשיעור' then 'הפריע בשיעור'
    when 'היעדרות משיעור' then 'נעדר משיעור'
    when 'היעדרות מהשיעור' then 'נעדר מהשיעור'
    when 'חיסור משיעור' then 'נעדר משיעור'
    when 'איחור' then 'איחר'
    when 'איחור לשיעור' then 'איחר לשיעור'
    when 'אי-הכנת שיעורי בית' then 'לא הכין שיעורי בית'
    when 'אי הכנת שיעורי בית' then 'לא הכין שיעורי בית'
    when 'אי הגשת עבודה' then 'לא הגיש עבודה'
    when 'אי-הגשת עבודה' then 'לא הגיש עבודה'
    else null end;
  if phrase is not null then
    return who || ' ' || phrase || ', ולכן יישאר בסוף היום להשלמת עבודה';
  elsif r <> '' then
    return who || ' יישאר בסוף היום להשלמת עבודה בשל ' || r;
  end if;
  return who || ' יישאר בסוף היום להשלמת עבודה';
end;
$$;

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
  body := replace(body, '{reason_clause}', public.parent_reason_clause(p_student_name, p_reason));
  body := replace(body, '{teacher_sign}', '.');
  body := replace(body, '{student_name}', coalesce(p_student_name, ''));
  body := replace(body, '{class}', coalesce(p_class_name, ''));
  body := replace(body, '{release_time}', coalesce(p_release_time, ''));
  body := replace(body, '{reason}', coalesce(p_reason, ''));
  return body;
end;
$$;

revoke all on function public.apply_parent_template(text, text, text, text, text, text) from public, anon;
grant execute on function public.apply_parent_template(text, text, text, text, text, text) to authenticated;

update public.school_settings
set parent_message_template = public.default_parent_message_template()
where id = 1
  and (parent_message_template is null
       or btrim(parent_message_template) = ''
       or parent_message_template like 'שלום {parent_name},%רצינו לעדכן שבנך%'
       or parent_message_template like 'שלום, עדכון מהישיבה:%'
       or parent_message_template like 'שלום,%הריני לעדכן ש{reason_clause}%');

-- ---------------------------------------------------------------------------
-- 3) Staff title (הרב / המורה / other) for the parent-message signature,
--    required name + title when requesting a role, one homeroom class, and
--    "already has a homeroom teacher" info for the sign-up class list.

alter table public.profiles add column if not exists title text;

do $$
begin
  alter table public.profiles add constraint profiles_title_len
    check (title is null or char_length(title) <= 20);
exception when duplicate_object then null;
end $$;

grant update (title) on public.profiles to authenticated;

drop function if exists public.list_open_classes();
create function public.list_open_classes()
returns table (id uuid, name text, has_homeroom boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.homeroom_teacher_id is not null
  from public.classes c
  where c.active
    and public.caller_permitted()
  order by c.name;
$$;

revoke all on function public.list_open_classes() from public, anon;
grant execute on function public.list_open_classes() to authenticated;

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
  if nullif(btrim(coalesce(me.title, '')), '') is null then
    raise exception 'צריך לבחור תואר';
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

revoke all on function public.request_staff_role(text, uuid[]) from public, anon;
grant execute on function public.request_staff_role(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Principal (admin) and secretary may be REQUESTED at sign-up. The request
--    is only a wish: role itself still changes only via admin/secretary
--    (admin role only by an admin) in protect_profile / approve_staff_request.

alter table public.profiles drop constraint if exists profiles_requested_role_kind;
alter table public.profiles add constraint profiles_requested_role_kind
  check (requested_role is null or requested_role in ('teacher', 'homeroom', 'secretary', 'admin'));

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

-- Also needed (see 20260312000000_fix_profile_title_select.sql)
grant select (title) on public.profiles to authenticated;
