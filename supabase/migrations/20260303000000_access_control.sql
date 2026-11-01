-- Sign-in allowlist. Safe to paste again.
-- Off until an admin sets a domain or at least one email.
-- A person who matches neither cannot read school data, even if they have a role.
-- An admin can still open Settings and correct the list.

alter table public.school_settings add column if not exists allowed_domain text;

update public.school_settings
set allowed_domain = nullif(lower(trim(allowed_email_domain)), '')
where id = 1
  and allowed_domain is null
  and allowed_email_domain is not null;

create table if not exists public.allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from public, anon, authenticated;

grant select (allowed_domain), update (allowed_domain)
  on public.school_settings to authenticated;

create or replace function public.email_permitted(target_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  domain text;
  normalized text;
  listed int;
begin
  select nullif(lower(trim(coalesce(allowed_domain, allowed_email_domain, ''))), '')
  into domain
  from public.school_settings
  where id = 1;

  select count(*) into listed from public.allowed_emails;
  if domain is null and listed = 0 then
    return true;
  end if;

  normalized := lower(trim(coalesce(target_email, '')));
  if domain is not null and split_part(normalized, '@', 2) = domain then
    return true;
  end if;
  return exists (
    select 1 from public.allowed_emails e where e.email = normalized
  );
end;
$$;

create or replace function public.caller_permitted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.email_permitted(
    coalesce((select email from public.profiles where id = auth.uid()), '')
  )
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() is not null and public.caller_permitted()
$$;

create or replace function public.can_mark_detentions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.caller_permitted()
    and public.my_role() in ('teacher', 'homeroom', 'secretary', 'admin')
$$;

create or replace function public.can_sign()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.caller_permitted()
    and public.my_role() in ('secretary', 'admin')
$$;

create or replace function public.can_manage_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.caller_permitted()
    and public.my_role() in ('secretary', 'admin')
$$;

create or replace function public.can_view_student_contact(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.caller_permitted()
    and (
      public.is_admin()
      or public.my_role() = 'secretary'
      or (
        public.my_role() = 'homeroom'
        and exists (
          select 1 from public.classes c
          where c.id = cid and c.homeroom_teacher_id = auth.uid()
        )
      )
    )
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
  if not public.email_permitted(em) then
    return 'denied';
  end if;
  if assigned is null then
    return 'pending';
  end if;
  return 'ok';
end;
$$;

create or replace function public.list_allowed_emails()
returns table (email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'רק מנהל יכול לעדכן הגדרות';
  end if;
  return query select e.email from public.allowed_emails e order by e.email;
end;
$$;

create or replace function public.set_allowed_emails(p_emails text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text;
  cleaned text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'רק מנהל יכול לעדכן הגדרות';
  end if;
  delete from public.allowed_emails;
  if p_emails is null then
    return;
  end if;
  foreach raw in array p_emails loop
    cleaned := lower(trim(raw));
    if cleaned ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      insert into public.allowed_emails (email) values (cleaned)
      on conflict (email) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  normalized_email text;
begin
  -- The account is created either way. School data stays closed unless
  -- email_permitted() is true. That stays true until a domain or allowlist is set.
  normalized_email := lower(trim(coalesce(new.email, '')));
  uname := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    split_part(normalized_email, '@', 1)
  );
  insert into public.profiles (id, email, full_name)
  values (new.id, normalized_email, coalesce(uname, ''))
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop policy if exists settings_select on public.school_settings;
create policy settings_select on public.school_settings
  for select to authenticated
  using (public.is_admin() or public.is_staff());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (
      public.caller_permitted()
      and public.my_role() = 'secretary'
      and role is distinct from 'admin'
    )
  )
  with check (
    id = auth.uid()
    or public.is_admin()
    or (
      public.caller_permitted()
      and public.my_role() = 'secretary'
      and role is distinct from 'admin'
    )
  );

grant execute on function public.email_permitted(text) to authenticated;
grant execute on function public.caller_permitted() to authenticated;
grant execute on function public.my_access_status() to authenticated;
grant execute on function public.list_allowed_emails() to authenticated;
grant execute on function public.set_allowed_emails(text[]) to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.can_mark_detentions() to authenticated;
grant execute on function public.can_sign() to authenticated;
grant execute on function public.can_manage_operations() to authenticated;
grant execute on function public.can_view_student_contact(uuid) to authenticated;

revoke all on function public.email_permitted(text) from public, anon;
revoke all on function public.caller_permitted() from public, anon;
revoke all on function public.my_access_status() from public, anon;
revoke all on function public.list_allowed_emails() from public, anon;
revoke all on function public.set_allowed_emails(text[]) from public, anon;
