-- Release time for a detention, and real delete of a student or class.
-- Every teacher and homeroom can read every student (names and class, not phones)
-- and mark any student. Homeroom may edit or delete only students in their class.
-- Safe to paste again in the Supabase SQL editor.

alter table public.detentions add column if not exists release_at timestamptz;
alter table public.detentions add column if not exists release_override_by uuid references public.profiles (id);
alter table public.detentions add column if not exists release_override_at timestamptz;
alter table public.detentions add column if not exists early_release boolean not null default false;
alter table public.detentions add column if not exists released_by uuid references public.profiles (id);

update public.detentions
set release_at = marked_at + make_interval(mins => duration_minutes)
where release_at is null;

alter table public.detentions alter column release_at set not null;

grant select (release_at, release_override_by, release_override_at, released_by)
  on public.detentions to authenticated;
grant insert (release_at) on public.detentions to authenticated;
grant update (early_release) on public.detentions to authenticated;

-- End-of-day duty rotates, so every signed-in staff role may release.
-- Phones and WhatsApp stay on can_sign() (secretary and admin only).
create or replace function public.can_release()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.caller_permitted()
    and public.my_role() in ('teacher', 'homeroom', 'secretary', 'admin')
$$;

grant execute on function public.can_release() to authenticated;
revoke all on function public.can_release() from public, anon;

-- Names and classes for every staff role. Parent phones stay off this table.
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated
  using (public.is_staff());

drop policy if exists students_delete on public.students;
create policy students_delete on public.students
  for delete to authenticated
  using (public.manages_class(class_id));

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
    new.release_at := now() + make_interval(mins => new.duration_minutes);
  end if;
  new.created_at := now();
  new.updated_at := now();
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
  if current_user = 'authenticated' and new.release_at is distinct from old.release_at then
    raise exception 'אי אפשר לשנות פרטי השארות';
  end if;

  if new.status = 'completed' and old.status = 'pending' then
    if not public.can_release() then
      raise exception 'אין הרשאה לאשר סיום';
    end if;
    if now() < old.release_at and not (public.is_admin() and new.early_release) then
      raise exception 'עדיין לא הגיעה שעת היציאה';
    end if;
    if now() < old.release_at then
      new.release_override_by := auth.uid();
      new.release_override_at := now();
    else
      new.release_override_by := old.release_override_by;
      new.release_override_at := old.release_override_at;
    end if;
    new.early_release := false;
    new.released_by := auth.uid();
    new.signed_by := auth.uid();
    new.signed_at := now();
    new.completed_at := now();
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
  elsif new.status = 'cancelled' and old.status = 'pending' then
    if not (public.can_sign() or old.marked_by = auth.uid()) then
      raise exception 'אין הרשאה לבטל';
    end if;
    new.early_release := false;
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
    new.signed_by := old.signed_by;
    new.signed_at := old.signed_at;
    new.completed_at := old.completed_at;
    new.released_by := old.released_by;
    new.release_override_by := old.release_override_by;
    new.release_override_at := old.release_override_at;
  elsif new.status is distinct from old.status then
    raise exception 'מעבר סטטוס אינו חוקי';
  else
    new.early_release := false;
    new.signed_by := old.signed_by;
    new.signed_at := old.signed_at;
    new.completed_at := old.completed_at;
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
    new.released_by := old.released_by;
    new.release_override_by := old.release_override_by;
    new.release_override_at := old.release_override_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Deletes the student. If there is detention history, the caller must type the
-- full name, and those detentions (and their messages) are removed with the student.
create or replace function public.delete_student(p_id uuid, p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  n int;
  expected text;
begin
  select id, first_name, last_name, class_id into s
  from public.students
  where id = p_id;
  if s.id is null then
    raise exception 'התלמיד לא נמצא';
  end if;
  if not public.manages_class(s.class_id) then
    raise exception 'אין הרשאה למחוק את התלמיד';
  end if;
  select count(*) into n from public.detentions where student_id = p_id;
  expected := trim(s.first_name) || ' ' || trim(s.last_name);
  if n > 0 and trim(coalesce(p_confirm, '')) <> expected then
    raise exception 'כדי למחוק תלמיד עם היסטוריה יש להקליד את שמו המלא';
  end if;
  if n > 0 then
    delete from public.detentions where student_id = p_id;
  end if;
  delete from public.students where id = p_id;
end;
$$;

grant execute on function public.delete_student(uuid, text) to authenticated;
revoke all on function public.delete_student(uuid, text) from public, anon;

create or replace function public.delete_class(p_id uuid, p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room record;
  n int;
begin
  if not public.can_manage_operations() then
    raise exception 'אין הרשאה למחוק את הכיתה';
  end if;
  select id, name into room from public.classes where id = p_id;
  if room.id is null then
    raise exception 'הכיתה לא נמצאה';
  end if;
  select count(*) into n
  from public.detentions d
  join public.students s on s.id = d.student_id
  where s.class_id = p_id;
  if n > 0 and trim(coalesce(p_confirm, '')) <> trim(room.name) then
    raise exception 'כדי למחוק כיתה עם היסטוריה יש להקליד את שם הכיתה';
  end if;
  delete from public.detentions d
  using public.students s
  where d.student_id = s.id and s.class_id = p_id;
  delete from public.students where class_id = p_id;
  delete from public.classes where id = p_id;
end;
$$;

grant execute on function public.delete_class(uuid, text) to authenticated;
revoke all on function public.delete_class(uuid, text) from public, anon;

drop policy if exists detentions_update on public.detentions;
create policy detentions_update on public.detentions
  for update to authenticated
  using (
    public.can_release()
    or (marked_by = auth.uid() and status = 'pending')
  )
  with check (
    public.can_release()
    or (marked_by = auth.uid() and status = 'cancelled')
  );
