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
  if p_role not in ('teacher', 'homeroom') then
    raise exception 'אפשר לבקש רק מורה מקצועי או מחנך';
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
