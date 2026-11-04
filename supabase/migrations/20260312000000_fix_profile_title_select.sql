-- Fix: profiles uses column-level SELECT grants. The title column (added in
-- 20260311000000) had UPDATE but no SELECT grant, so the app's profile query
-- failed with "permission denied" and every login bounced to the sign-in page.
-- Idempotent; safe to re-run.
alter table public.profiles add column if not exists title text;
grant select (title), update (title) on public.profiles to authenticated;
notify pgrst, 'reload schema';
