-- One-time: merge a second account (e.g. the homeroom-teacher login) INTO the
-- owner account, then delete the second login. Run in the Supabase SQL editor
-- AFTER migrations 20260312000000 and 20260313000000.
--
-- 1) Fill the two emails below (exactly as shown in the Staff screen).
-- 2) Run with v_dry_run := true first: it only prints what would move.
-- 3) Set v_dry_run := false and run again to merge. Safe to re-run: when the
--    second account no longer exists it just reports "nothing to merge".
do $$
declare
  v_primary_email   text := 'OWNER_EMAIL_HERE';      -- stays (owner/admin)
  v_secondary_email text := 'HOMEROOM_EMAIL_HERE';   -- merged in, then deleted
  v_dry_run         boolean := true;

  v_primary   public.profiles%rowtype;
  v_secondary public.profiles%rowtype;
  fk record;
  n bigint;
begin
  select * into v_primary from public.profiles where lower(email) = lower(btrim(v_primary_email));
  select * into v_secondary from public.profiles where lower(email) = lower(btrim(v_secondary_email));

  if v_primary.id is null then
    raise exception 'Primary account % not found', v_primary_email;
  end if;
  if v_secondary.id is null then
    raise notice 'Secondary account % not found - nothing to merge (already done?)', v_secondary_email;
    return;
  end if;
  if v_primary.id = v_secondary.id then
    raise exception 'The two emails are the same account';
  end if;
  if v_secondary.is_owner then
    raise exception 'The SECONDARY account is the owner. Swap the two emails.';
  end if;
  if v_primary.role is distinct from 'admin' then
    raise exception 'Primary account must be admin/owner (it is %)', v_primary.role;
  end if;

  raise notice 'Primary:   % (%), role %, owner %', v_primary.email, v_primary.full_name, v_primary.role, v_primary.is_owner;
  raise notice 'Secondary: % (%), role %', v_secondary.email, v_secondary.full_name, v_secondary.role;

  -- Detention rows are protected against edits by triggers; bypass triggers
  -- for this transaction only (FK targets stay valid: we only re-point ids).
  if not v_dry_run then
    set local session_replication_role = replica;
  end if;

  -- Every foreign key that points at profiles(id), found automatically.
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and cardinality(c.conkey) = 1
  loop
    execute format('select count(*) from %s where %I = $1', fk.tbl, fk.col) into n using v_secondary.id;
    if n > 0 then
      raise notice '%.%: % row(s)', fk.tbl, fk.col, n;
      if not v_dry_run then
        execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
          using v_primary.id, v_secondary.id;
      end if;
    end if;
  end loop;

  if v_dry_run then
    raise notice 'DRY RUN - nothing changed. Set v_dry_run := false to merge.';
    return;
  end if;

  set local session_replication_role = origin;

  -- Fill missing name/phone on the owner from the second account.
  update public.profiles p
  set full_name = case when btrim(coalesce(p.full_name, '')) = '' then v_secondary.full_name else p.full_name end,
      phone = coalesce(p.phone, v_secondary.phone),
      title = coalesce(p.title, v_secondary.title)
  where p.id = v_primary.id;

  -- Remove the second login (its profile row goes with it).
  delete from auth.users where id = v_secondary.id;

  raise notice 'Merged % into %.', v_secondary.email, v_primary.email;
end $$;
