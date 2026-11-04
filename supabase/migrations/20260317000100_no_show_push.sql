-- Step 2 of 2 (run after 20260317000000_no_show_status.sql).
-- 1) "לא הגיע" (no_show): any approved staff on release duty can set it;
--    undo (back to pending) only for marker / homeroom / secretary / admin.
-- 2) Phone push notifications to the student's homeroom teacher when the
--    student is marked, released, or marked as did-not-show.
-- Safe to paste again in the Supabase SQL editor.

alter table public.detentions add column if not exists no_show_by uuid references public.profiles (id) on delete set null;
alter table public.detentions add column if not exists no_show_at timestamptz;
grant select (no_show_by, no_show_at) on public.detentions to authenticated;

create or replace function public.detentions_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- edit_detention() sets this flag after its own permission check.
  if coalesce(current_setting('hishaarut.edit_detention', true), '') = '1' then
    new.updated_at := now();
    return new;
  end if;
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
    new.no_show_by := old.no_show_by;
    new.no_show_at := old.no_show_at;
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
    new.no_show_by := old.no_show_by;
    new.no_show_at := old.no_show_at;
  elsif new.status = 'no_show' and old.status = 'pending' then
    -- Anyone on release duty (every approved staff role) may record it.
    if not public.can_release() then
      raise exception 'אין הרשאה לסמן שהתלמיד לא הגיע';
    end if;
    new.early_release := false;
    new.no_show_by := auth.uid();
    new.no_show_at := now();
    new.signed_by := old.signed_by;
    new.signed_at := old.signed_at;
    new.completed_at := old.completed_at;
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
    new.released_by := old.released_by;
    new.release_override_by := old.release_override_by;
    new.release_override_at := old.release_override_at;
  elsif new.status = 'pending' and old.status = 'no_show' then
    -- Undo: same people who may edit a detention.
    if not public.can_change_detention(old.id) then
      raise exception 'אין הרשאה לבטל את הסימון';
    end if;
    new.early_release := false;
    new.no_show_by := null;
    new.no_show_at := null;
    new.signed_by := old.signed_by;
    new.signed_at := old.signed_at;
    new.completed_at := old.completed_at;
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
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
    new.no_show_by := old.no_show_by;
    new.no_show_at := old.no_show_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Push subscriptions (one row per device/browser)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- Server-only settings: VAPID keys (filled automatically by the send-push
-- function on first use), the hook secret, and the function URL.
create table if not exists public.push_settings (
  id boolean primary key default true check (id),
  function_url text not null default 'https://rgybnihrbbkdpgjperms.supabase.co/functions/v1/send-push',
  hook_secret text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  vapid_public_key text,
  vapid_private_key text,
  vapid_subject text not null default 'mailto:admin@example.com'
);
insert into public.push_settings (id) values (true) on conflict (id) do nothing;
alter table public.push_settings enable row level security;
revoke all on public.push_settings from anon, authenticated;

create or replace function public.push_public_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select vapid_public_key from public.push_settings where public.is_staff()
$$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'אין הרשאה';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'מנוי התראות לא תקין';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke all on function public.push_public_key() from public, anon;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.push_public_key() to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- pg_net lets the database call the send-push Edge Function.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available: %', sqlerrm;
end $$;

create or replace function public.notify_homeroom_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_homeroom uuid;
  v_url text;
  v_secret text;
begin
  if tg_op = 'INSERT' then
    v_event := 'marked';
  elsif new.status = 'completed' and old.status = 'pending' then
    v_event := 'released';
  elsif new.status = 'no_show' and old.status = 'pending' then
    v_event := 'no_show';
  else
    return null;
  end if;

  select c.homeroom_teacher_id into v_homeroom
  from public.students s join public.classes c on c.id = s.class_id
  where s.id = new.student_id;
  -- Nobody to tell, or the homeroom teacher did it himself.
  if v_homeroom is null or v_homeroom = auth.uid() then
    return null;
  end if;
  if not exists (select 1 from public.push_subscriptions p where p.user_id = v_homeroom) then
    return null;
  end if;

  select function_url, hook_secret into v_url, v_secret from public.push_settings where id;
  if v_url is null then
    return null;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('detention_id', new.id, 'event', v_event, 'user_id', v_homeroom),
      headers := jsonb_build_object('content-type', 'application/json', 'x-hook-secret', v_secret)
    );
  exception when others then
    -- Never block marking/releasing because a phone alert failed.
    raise notice 'push not queued: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notify_homeroom_push() from public, anon, authenticated;

drop trigger if exists detentions_push_insert_trg on public.detentions;
create trigger detentions_push_insert_trg
  after insert on public.detentions
  for each row execute function public.notify_homeroom_push();

drop trigger if exists detentions_push_update_trg on public.detentions;
create trigger detentions_push_update_trg
  after update of status on public.detentions
  for each row execute function public.notify_homeroom_push();
