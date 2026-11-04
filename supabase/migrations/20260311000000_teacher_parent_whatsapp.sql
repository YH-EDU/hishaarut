-- Teachers update parents directly from their own WhatsApp.
-- 1) get_detention_parent_phones: returns mother/father phones for a detention
--    only to the teacher who marked it (same day, not cancelled), or to staff
--    who can already view the student's contacts.
-- 2) The parent template becomes short, without the parent's name.
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
  select E'שלום, עדכון מהישיבה:\n{student_name} נשאר היום בישיבה לאחר סיום הלימודים.\nשעת היציאה המשוערת: {release_time}.\nתודה.'
$$;

update public.school_settings
set parent_message_template = public.default_parent_message_template()
where id = 1
  and (parent_message_template is null
       or btrim(parent_message_template) = ''
       or parent_message_template like 'שלום {parent_name},%רצינו לעדכן שבנך%');
