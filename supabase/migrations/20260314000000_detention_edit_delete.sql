-- Edit (reason, release time) and delete a detention: allowed for the teacher
-- who marked it, the homeroom teacher of the student's class, and
-- admin/owner/secretary. Enforced here (security definer RPCs), not only in UI.
-- Idempotent; safe to re-run.

create or replace function public.can_change_detention(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.caller_permitted()
    and exists (
      select 1
      from public.detentions d
      join public.students s on s.id = d.student_id
      where d.id = p_id
        and (
          public.my_role() in ('admin', 'secretary')
          or (d.marked_by = auth.uid() and public.my_role() is not null)
          or exists (
            select 1 from public.classes c
            where c.id = s.class_id and c.homeroom_teacher_id = auth.uid()
          )
        )
    )
$$;

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

create or replace function public.edit_detention(
  p_id uuid,
  p_reason_id uuid,
  p_reason_text text,
  p_release_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.detentions%rowtype;
  v_label text;
  v_minutes int;
begin
  if not public.can_change_detention(p_id) then
    raise exception 'אין הרשאה לערוך את ההשארות';
  end if;
  select * into d from public.detentions where id = p_id for update;
  if d.status <> 'pending' then
    raise exception 'אפשר לערוך רק השארות שעוד לא הסתיימה';
  end if;
  if p_reason_id is not null then
    select r.label into v_label from public.detention_reasons r where r.id = p_reason_id and r.active;
    if v_label is null then
      raise exception 'הסיבה אינה פעילה';
    end if;
  else
    v_label := btrim(coalesce(p_reason_text, ''));
    if v_label = '' then
      raise exception 'יש לבחור סיבה';
    end if;
  end if;
  if p_release_at is null or p_release_at <= d.marked_at then
    raise exception 'שעת היציאה צריכה להיות אחרי שעת הסימון';
  end if;
  v_minutes := ceil(extract(epoch from (p_release_at - d.marked_at)) / 60)::int;
  if v_minutes < 1 or v_minutes > 240 then
    raise exception 'שעת היציאה עד 4 שעות אחרי הסימון';
  end if;

  perform set_config('hishaarut.edit_detention', '1', true);
  update public.detentions
  set reason_id = p_reason_id,
      reason_text = v_label,
      release_at = p_release_at,
      duration_minutes = v_minutes
  where id = p_id;
  perform set_config('hishaarut.edit_detention', '', true);
end;
$$;

create or replace function public.delete_detention(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_change_detention(p_id) then
    raise exception 'אין הרשאה למחוק את ההשארות';
  end if;
  delete from public.detentions where id = p_id;
end;
$$;

revoke all on function public.can_change_detention(uuid) from public, anon;
revoke all on function public.edit_detention(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.delete_detention(uuid) from public, anon;
grant execute on function public.can_change_detention(uuid) to authenticated;
grant execute on function public.edit_detention(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.delete_detention(uuid) to authenticated;
