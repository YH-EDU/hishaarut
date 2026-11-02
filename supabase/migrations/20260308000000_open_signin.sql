-- Any Google account may sign in and request a role.
-- A domain or allowlist no longer blocks that request.
-- School data stays closed until a role is approved.
-- Optional auto_approve_domain grants teacher immediately. Off (null) by default.
-- Safe to paste again.

alter table public.school_settings add column if not exists auto_approve_domain text;

update public.school_settings
set allowed_domain = null,
    allowed_email_domain = null
where id = 1;

delete from public.allowed_emails;

grant select (auto_approve_domain), update (auto_approve_domain)
  on public.school_settings to authenticated;

-- Signed-in profile exists. A role is still required by is_staff() before any school data.
create or replace function public.caller_permitted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.profiles p where p.id = auth.uid())
$$;

create or replace function public.my_access_status()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  em text;
  assigned public.user_role;
begin
  select email, role into em, assigned from public.profiles where id = auth.uid();
  if em is null then
    return 'denied';
  end if;
  if assigned is null then
    return 'pending';
  end if;
  return 'ok';
end;
$$;

create or replace function public.maybe_auto_approve()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  domain text;
  em text;
  assigned public.user_role;
begin
  if auth.uid() is null then
    return;
  end if;
  select p.role, p.email into assigned, em from public.profiles p where p.id = auth.uid();
  if assigned is not null then
    return;
  end if;
  select nullif(lower(trim(coalesce(s.auto_approve_domain, ''))), '')
  into domain
  from public.school_settings s
  where s.id = 1;
  if domain is null then
    return;
  end if;
  if split_part(lower(trim(coalesce(em, ''))), '@', 2) = domain then
    update public.profiles
    set role = 'teacher',
        requested_role = null,
        requested_class_ids = '{}'
    where id = auth.uid()
      and role is null;
  end if;
end;
$$;

grant execute on function public.maybe_auto_approve() to authenticated;
revoke all on function public.maybe_auto_approve() from public, anon;
