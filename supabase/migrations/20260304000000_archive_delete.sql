-- Secretary and admin may permanently delete a student or a class.
-- Archive (students.active / classes.active) already uses the update policies.
-- Safe to paste again in the Supabase SQL editor.

drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes
  for delete to authenticated
  using (public.can_manage_operations());

drop policy if exists students_delete on public.students;
create policy students_delete on public.students
  for delete to authenticated
  using (public.can_manage_operations());
