-- Role and privacy checks. The script raises if a boundary is wrong.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001', 'admin@example.test', '{"full_name":"מנהלת בית הספר"}'),
  ('30000000-0000-0000-0000-000000000002', 'teacher@example.test', '{"full_name":"רונית מורה"}'),
  ('30000000-0000-0000-0000-000000000003', 'homeroom@example.test', '{"full_name":"מיכל מחנכת"}'),
  ('30000000-0000-0000-0000-000000000004', 'secretary@example.test', '{"full_name":"דנה מזכירה"}'),
  ('30000000-0000-0000-0000-000000000005', 'pending@example.test', '{"full_name":"משתמש ממתין"}'),
  ('30000000-0000-0000-0000-000000000006', 'homeroom2@example.test', '{"full_name":"יוסי מחנך"}');

update public.profiles set role = 'admin' where id = '30000000-0000-0000-0000-000000000001';
update public.profiles set role = 'teacher' where id = '30000000-0000-0000-0000-000000000002';
update public.profiles set role = 'homeroom', phone = '050-7111111' where id = '30000000-0000-0000-0000-000000000003';
update public.profiles set role = 'secretary', phone = '050-7222222' where id = '30000000-0000-0000-0000-000000000004';
update public.profiles set role = 'homeroom', phone = '050-7333333' where id = '30000000-0000-0000-0000-000000000006';

update public.classes set homeroom_teacher_id = '30000000-0000-0000-0000-000000000003'
  where id = '10000000-0000-0000-0000-000000000001';
update public.classes set homeroom_teacher_id = '30000000-0000-0000-0000-000000000006'
  where id = '10000000-0000-0000-0000-000000000002';

-- Keep the suite able to mark at any hour. The hours cases at the end restore the real week.
update public.school_settings set
  start_sun = '00:00', end_sun = '23:59',
  start_mon = '00:00', end_mon = '23:59',
  start_tue = '00:00', end_tue = '23:59',
  start_wed = '00:00', end_wed = '23:59',
  start_thu = '00:00', end_thu = '23:59',
  start_fri = '00:00', end_fri = '23:59',
  start_sat = '00:00', end_sat = '23:59';

do $$
begin
  if (select count(*) from public.students) <> 15 then
    raise exception 'expected 15 seeded students';
  end if;
  if public.normalize_phone_il('050-7000001') <> '972507000001' then
    raise exception 'normalize mobile';
  end if;
  if public.normalize_phone_il('+972 50-700-0001') <> '972507000001' then
    raise exception 'normalize international';
  end if;
  if public.normalize_phone_il('9720507000001') <> '972507000001' then
    raise exception 'normalize 9720';
  end if;
  if public.normalize_phone_il('03-1234567') <> '97231234567' then
    raise exception 'normalize landline';
  end if;
  if public.normalize_phone_il('abc') is not null then
    raise exception 'normalize junk';
  end if;
end $$;

-- Pending user sees no students and cannot mark.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.students;
  if n <> 0 then
    raise exception 'pending user read students';
  end if;
  begin
    insert into public.detentions (student_id, reason_text, duration_minutes)
    values ('20000000-0000-0000-0000-000000000001', 'בדיקה', 15);
    raise exception 'pending user marked a detention';
  exception
    when others then
      if sqlerrm not like '%אין הרשאה לסמן השארות%' and sqlerrm not like '%row-level security%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Subject teacher sees every student, not parent phones, and can mark.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  n int;
  phone text;
  detention uuid;
begin
  select count(*) into n from public.students;
  if n <> 15 then
    raise exception 'teacher should see all students, saw %', n;
  end if;
  begin
    select parent_phone into phone from public.students limit 1;
    raise exception 'teacher read parent_phone';
  exception
    when insufficient_privilege then
      null;
  end;
  select count(*) into n from public.list_student_contacts();
  if n <> 0 then
    raise exception 'teacher received contact rows';
  end if;
  begin
    perform public.list_notification_dispatch((timezone('Asia/Jerusalem', now()))::date);
    raise exception 'teacher listed dispatch';
  exception
    when others then
      if sqlerrm not like '%אין הרשאה לצפות בפרטי קשר%' then
        raise;
      end if;
  end;

  update public.students
    set parent_phone = '050-7999999'
    where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher updated a student';
  end if;

  insert into public.detentions (student_id, reason_id, reason_text, duration_minutes, notes)
  select '20000000-0000-0000-0000-000000000001', r.id, 'טקסט שיוחלף', 30, 'הערה פנימית'
  from public.detention_reasons r
  where r.label = 'הפרעה בשיעור'
  returning id into detention;

  if detention is null then
    raise exception 'teacher insert did not return id';
  end if;

  begin
    update public.detentions set status = 'completed' where id = detention;
    raise exception 'teacher completed a detention before the release time';
  exception
    when others then
      if sqlerrm not like '%עדיין לא הגיעה שעת היציאה%' then
        raise;
      end if;
  end;

  perform set_config('hishaarut.detention_id', detention::text, false);
end $$;
reset role;

do $$
declare
  detention uuid := current_setting('hishaarut.detention_id')::uuid;
  parent_body text;
  parent_phone text;
  parent_status public.notification_status;
  homeroom_phone text;
  homeroom_status public.notification_status;
  marked uuid;
  reason text;
  minutes int;
begin
  select d.marked_by, d.reason_text, d.duration_minutes
  into marked, reason, minutes
  from public.detentions d
  where d.id = detention;

  if marked <> '30000000-0000-0000-0000-000000000002' then
    raise exception 'marked_by was not forced to the caller';
  end if;
  if reason <> 'הפרעה בשיעור' or minutes <> 30 then
    raise exception 'reason snapshot was not taken from the preset';
  end if;

  select n.message_body, n.recipient_phone, n.status
  into parent_body, parent_phone, parent_status
  from public.notification_log n
  where n.detention_id = detention and n.event = 'marked' and n.recipient_type = 'parent' and n.audience = 'father';

  if parent_status <> 'pending' or parent_phone <> '972507000001' then
    raise exception 'parent notification was not queued';
  end if;
  if parent_body <> public.apply_parent_template(
    null,
    'מיכל ברק',
    'נועה ברק',
    'ז׳1',
    to_char(timezone('Asia/Jerusalem', (select release_at from public.detentions where id = detention)), 'HH24:MI'),
    'הפרעה בשיעור'
  ) then
    raise exception 'unexpected parent message: %', parent_body;
  end if;
  if parent_body not like 'שלום מיכל ברק,%' or parent_body not like '%בברכה, צוות הישיבה%' then
    raise exception 'parent message missed the greeting or the sign-off: %', parent_body;
  end if;

  select n.recipient_phone, n.status
  into homeroom_phone, homeroom_status
  from public.notification_log n
  where n.detention_id = detention and n.event = 'marked' and n.recipient_type = 'homeroom';

  if homeroom_status <> 'pending' or homeroom_phone <> '972507111111' then
    raise exception 'homeroom notification was not queued';
  end if;

  if exists (
    select 1 from public.notification_log n
    where n.detention_id = detention and n.message_body like '%050%'
  ) then
    raise exception 'message included a phone number';
  end if;
end $$;

-- Teacher cannot read the stored parent phone, and can cancel their own mark.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  detention uuid := current_setting('hishaarut.detention_id')::uuid;
  phone text;
  n int;
begin
  begin
    select recipient_phone into phone from public.notification_log limit 1;
    raise exception 'teacher read recipient_phone';
  exception
    when insufficient_privilege then
      null;
  end;
  if not exists (
    select 1 from public.notification_log
    where detention_id = detention and status = 'pending'
  ) then
    raise exception 'teacher should see notification status';
  end if;

  update public.detentions set status = 'cancelled' where id = detention;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'teacher could not cancel';
  end if;
end $$;
reset role;

-- A fresh mark for the secretary to complete. Invalid phone is skipped.
update public.students
  set parent_phone = 'לא-מספר'
  where id = '20000000-0000-0000-0000-000000000003';

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  detention uuid;
begin
  insert into public.detentions (student_id, reason_text, duration_minutes)
  values ('20000000-0000-0000-0000-000000000003', 'איחור לשיעור', 15)
  returning id into detention;
  perform set_config('hishaarut.detention_id', detention::text, false);
end $$;
reset role;

do $$
declare
  detention uuid := current_setting('hishaarut.detention_id')::uuid;
  parent_status public.notification_status;
  parent_error text;
begin
  select status, error_text into parent_status, parent_error
  from public.notification_log
  where detention_id = detention and event = 'marked' and recipient_type = 'parent';
  if parent_status <> 'skipped' or parent_error <> 'invalid_phone' then
    raise exception 'invalid phone should skip the parent message';
  end if;
end $$;

update public.students
  set parent_phone = '050-7000003'
  where id = '20000000-0000-0000-0000-000000000003';

-- Homeroom manages only their class, including parent phones.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.list_student_contacts();
  if n <> 4 then
    raise exception 'homeroom should see 4 contact rows, saw %', n;
  end if;
  update public.students
    set parent_phone = '050-7000099'
    where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'homeroom could not update own class';
  end if;
  update public.students
    set parent_phone = '050-7000088'
    where id = '20000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'homeroom updated another class';
  end if;
  begin
    insert into public.students (first_name, last_name, gender, class_id, parent_name, parent_phone)
    values ('תלמיד', 'חדש', 'male', '10000000-0000-0000-0000-000000000002', 'הורה', '050-7000042');
    raise exception 'homeroom inserted into another class';
  exception
    when insufficient_privilege or check_violation or others then
      if sqlerrm not like '%row-level security%' then
        raise;
      end if;
  end;
  insert into public.students (first_name, last_name, gender, class_id, parent_name, parent_phone)
  values ('תלמיד', 'חדש', 'male', '10000000-0000-0000-0000-000000000001', 'הורה חדש', '050-7000042');
end $$;
reset role;

do $$
begin
  if (select parent_phone from public.students where id = '20000000-0000-0000-0000-000000000001') <> '050-7000099' then
    raise exception 'homeroom phone edit did not stick';
  end if;
  if (select parent_phone from public.students where id = '20000000-0000-0000-0000-000000000005') <> '050-7000005' then
    raise exception 'other class phone changed';
  end if;
  if (select created_by from public.students where first_name = 'תלמיד' and last_name = 'חדש')
     <> '30000000-0000-0000-0000-000000000003' then
    raise exception 'created_by was not stamped';
  end if;
end $$;

-- Secretary completes, reads phones, and the completion message is queued.
update public.detentions
set release_at = now() - interval '1 minute'
where id = current_setting('hishaarut.detention_id')::uuid;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  detention uuid := current_setting('hishaarut.detention_id')::uuid;
  n int;
  body text;
  log_id uuid;
begin
  select count(*) into n from public.list_student_contacts();
  if n <> 16 then
    raise exception 'secretary should see every contact, saw %', n;
  end if;
  select count(*) into n from public.list_notification_dispatch((timezone('Asia/Jerusalem', now()))::date);
  if n < 2 then
    raise exception 'secretary dispatch was empty';
  end if;

  update public.detentions set status = 'completed' where id = detention;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not complete';
  end if;

  select id into log_id
  from public.notification_log
  where detention_id = detention and event = 'completed' and recipient_type = 'parent';
  if log_id is null then
    raise exception 'completion notice was not created';
  end if;

  update public.notification_log set status = 'sent' where id = log_id;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not mark sent';
  end if;
  perform set_config('hishaarut.log_id', log_id::text, false);
end $$;
reset role;

do $$
declare
  detention uuid := current_setting('hishaarut.detention_id')::uuid;
  log_id uuid := current_setting('hishaarut.log_id')::uuid;
  body text;
  signer uuid;
  sent_by uuid;
begin
  select signed_by into signer from public.detentions where id = detention;
  if signer <> '30000000-0000-0000-0000-000000000004' then
    raise exception 'signed_by was not the secretary';
  end if;
  if (select completed_at from public.detentions where id = detention) is null then
    raise exception 'completed_at missing';
  end if;
  select message_body into body
  from public.notification_log
  where detention_id = detention and event = 'completed' and recipient_type = 'parent';
  if body <> E'שלום, הודעה מבית הספר:\nמאיה אברהם סיימה את ההשארות והיא בדרכה הביתה.' then
    raise exception 'unexpected completion message: %', body;
  end if;
  select n.sent_by into sent_by from public.notification_log n where n.id = log_id;
  if sent_by <> '30000000-0000-0000-0000-000000000004' then
    raise exception 'sent_by was not stamped';
  end if;
end $$;

-- A teacher cannot mark a notification as sent.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  n int;
begin
  update public.notification_log
    set status = 'sent'
    where status = 'pending';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher marked notifications sent';
  end if;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'teacher changed own role';
  exception
    when others then
      if sqlerrm not like '%אין הרשאה לשנות תפקיד%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Admin assigns roles, cannot drop the last admin, and can edit reasons.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  n int;
begin
  update public.profiles set role = 'teacher' where id = '30000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'admin could not assign a role';
  end if;
  if (select count(*) from public.role_audit) < 1 then
    raise exception 'role audit missing';
  end if;
  begin
    update public.profiles set role = 'teacher' where id = auth.uid();
    raise exception 'last admin was removed';
  exception
    when others then
      if sqlerrm not like '%אי אפשר להסיר את המנהל האחרון%' then
        raise;
      end if;
  end;
  insert into public.detention_reasons (label, sort_order) values ('בדיקת מנהל', 90);
  update public.school_settings set school_name = 'בית ספר בדיקה' where id = 1;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.role_audit;
  if n <> 0 then
    raise exception 'teacher read the role audit';
  end if;
  update public.school_settings set school_name = 'פריצה' where id = 1;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher updated settings';
  end if;
end $$;
reset role;

do $$
begin
  if (select school_name from public.school_settings) <> 'בית ספר בדיקה' then
    raise exception 'admin settings update did not stick';
  end if;
  if (select role from public.profiles where id = '30000000-0000-0000-0000-000000000001') <> 'admin' then
    raise exception 'last admin check failed open';
  end if;
end $$;

-- A private Gmail account can ask for a role, but sees no school data until approved.
select set_config('request.jwt.claim.sub', '', false);
update public.school_settings
set allowed_email_domain = 'school.test', allowed_domain = 'school.test', auto_approve_domain = null
where id = 1;
insert into auth.users (id, email, raw_user_meta_data)
values
  ('30000000-0000-0000-0000-000000000099', 'person@gmail.com', '{}'),
  ('30000000-0000-0000-0000-000000000098', 'person@school.test', '{"name":"תלמיד מורה"}');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000099', false);
set role authenticated;
select public.request_staff_role('teacher', '{}'::uuid[]);
do $$
declare
  n int;
begin
  if public.my_access_status() <> 'pending' then
    raise exception 'gmail account should be pending';
  end if;
  if (select role from public.profiles where id = auth.uid()) is not null then
    raise exception 'gmail request assigned a role';
  end if;
  select count(*) into n from public.students;
  if n <> 0 then
    raise exception 'pending user read students';
  end if;
  select count(*) into n from public.list_open_classes();
  if n = 0 then
    raise exception 'pending user could not see class names for the request';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
update public.profiles set role = 'teacher' where id = '30000000-0000-0000-0000-000000000099';
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000099', false);
set role authenticated;
do $$
declare
  n int;
begin
  if public.my_access_status() <> 'ok' then
    raise exception 'approved gmail account was not ok';
  end if;
  select count(*) into n from public.students;
  if n = 0 then
    raise exception 'approved gmail account could not read students';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.students;
  if n = 0 then
    raise exception 'approved teacher was blocked by the old domain lock';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
select public.set_allowed_emails(array['teacher@example.test']);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.students;
  if n = 0 then
    raise exception 'allowlisted teacher was blocked';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
update public.school_settings set allowed_domain = null, allowed_email_domain = null where id = 1;
select public.set_allowed_emails(array[]::text[]);

-- Anon has no table access and cannot call the contact RPC.
set role anon;
do $$
begin
  begin
    perform 1 from public.students;
    raise exception 'anon read students';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform 1 from public.list_student_contacts();
    raise exception 'anon listed contacts';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;
reset role;

-- Cloud API mode only changes the channel. It does not send.
select set_config('request.jwt.claim.sub', '', false);
update public.school_settings set notification_mode = 'cloud_api' where id = 1;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  detention uuid;
  channel public.notification_channel;
begin
  insert into public.detentions (student_id, reason_text, duration_minutes)
  values ('20000000-0000-0000-0000-000000000002', 'חופש', 20)
  returning id into detention;
  select n.channel into channel
  from public.notification_log n
  where n.detention_id = detention and n.recipient_type = 'parent';
  if channel <> 'whatsapp_cloud' then
    raise exception 'cloud mode should stamp the cloud channel';
  end if;
  if (select status from public.notification_log where detention_id = detention and recipient_type = 'parent') <> 'pending' then
    raise exception 'cloud mode must not pretend the message was sent';
  end if;
end $$;
reset role;

-- Homeroom who marks their own student does not get a duplicate "marked" notice.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  detention uuid;
  homeroom_error text;
begin
  insert into public.detentions (student_id, reason_text, duration_minutes)
  values ('20000000-0000-0000-0000-000000000004', 'שכח מחברת', 25)
  returning id into detention;
  select error_text into homeroom_error
  from public.notification_log
  where detention_id = detention and event = 'marked' and recipient_type = 'homeroom';
  if homeroom_error <> 'marked_by_homeroom' then
    raise exception 'homeroom should not be notified about their own mark';
  end if;
end $$;
reset role;

-- The secretary runs the roster and staff list, but cannot touch an admin.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  n int;
begin
  update public.profiles
    set role = 'homeroom'
    where id = '30000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not assign a staff role';
  end if;

  insert into public.classes (name, grade)
  values ('ז׳9', 'ז');

  update public.classes
    set homeroom_teacher_id = '30000000-0000-0000-0000-000000000005'
    where name = 'ז׳9';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not assign a homeroom class';
  end if;

  update public.students
    set parent_phone = '050-7000080'
    where id = '20000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not edit a parent phone';
  end if;

  begin
    update public.profiles
      set role = 'admin'
      where id = '30000000-0000-0000-0000-000000000002';
    raise exception 'secretary granted admin';
  exception
    when others then
      if sqlerrm not like '%מזכירות לא יכולה למנות או לשנות מנהל%' then
        raise;
      end if;
  end;

  update public.profiles
    set role = 'teacher'
    where id = '30000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'secretary changed an admin role';
  end if;

  begin
    update public.school_settings set school_name = 'שינוי מזכירות' where id = 1;
    raise exception 'secretary changed school settings';
  exception
    when others then
      if sqlerrm not like '%מזכירות יכולה לעדכן רק את שעות הלימודים ואת נוסח ההודעה להורים%' then
        raise;
      end if;
  end;
  update public.school_settings set end_fri = '12:30', start_fri = '07:15' where id = 1;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not update the Friday end time';
  end if;

  begin
    insert into public.detention_reasons (label, sort_order) values ('סיבה של מזכירות', 99);
    raise exception 'secretary edited reasons';
  exception
    when insufficient_privilege or check_violation or others then
      if sqlerrm not like '%row-level security%' then
        raise;
      end if;
  end;
end $$;
reset role;

do $$
begin
  if (select role from public.profiles where id = '30000000-0000-0000-0000-000000000005') <> 'homeroom' then
    raise exception 'secretary staff assignment did not stick';
  end if;
  if (select role from public.profiles where id = '30000000-0000-0000-0000-000000000001') <> 'admin' then
    raise exception 'admin role was changed by the secretary';
  end if;
  if (select role from public.profiles where id = '30000000-0000-0000-0000-000000000002') = 'admin' then
    raise exception 'secretary promotion to admin stuck';
  end if;
  if (select parent_phone from public.students where id = '20000000-0000-0000-0000-000000000005') <> '050-7000080' then
    raise exception 'secretary phone edit did not stick';
  end if;
  if not exists (
    select 1 from public.classes
    where name = 'ז׳9' and homeroom_teacher_id = '30000000-0000-0000-0000-000000000005'
  ) then
    raise exception 'secretary class assignment did not stick';
  end if;
end $$;

-- Secretary can archive, and can delete only when nothing references the row.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  n int;
begin
  update public.students set active = false where id = '20000000-0000-0000-0000-000000000014';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not archive a student';
  end if;

  update public.students set active = true where id = '20000000-0000-0000-0000-000000000014';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not restore a student';
  end if;

  update public.classes set active = false where name = 'ז׳9';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not archive a class';
  end if;

  delete from public.students where id = '20000000-0000-0000-0000-000000000015';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not delete a student without detentions';
  end if;

  begin
    delete from public.students where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'secretary deleted a student who has detentions';
  exception
    when foreign_key_violation then
      null;
  end;

  delete from public.classes where name = 'ז׳9';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'secretary could not delete an empty class';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  n int;
begin
  update public.students set active = false where id = '20000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher archived a student';
  end if;

  delete from public.students where id = '20000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher deleted a student';
  end if;

  delete from public.classes where id = '10000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher deleted a class';
  end if;
end $$;
reset role;

do $$
begin
  if (select active from public.students where id = '20000000-0000-0000-0000-000000000014') is distinct from true then
    raise exception 'student restore did not stick';
  end if;
  if exists (select 1 from public.students where id = '20000000-0000-0000-0000-000000000015') then
    raise exception 'deleted student is still there';
  end if;
  if not exists (select 1 from public.students where id = '20000000-0000-0000-0000-000000000001') then
    raise exception 'student with detentions was removed';
  end if;
  if (select active from public.students where id = '20000000-0000-0000-0000-000000000002') is distinct from true then
    raise exception 'teacher archive stuck';
  end if;
end $$;

-- Second parent numbers stay private. Only secretary/admin can flag "no WhatsApp".
do $$
declare
  phones text[];
begin
  phones := public.ordered_parent_phones('050-7000001', '050-7000002', null, null, true, false, false, false);
  if phones <> array['972507000002']::text[] then
    raise exception 'flagged first number should fall through, got %', phones;
  end if;
end $$;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
select public.set_student_whatsapp_opt_out('20000000-0000-0000-0000-000000000001', 'parent1', true);
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  perform public.set_student_whatsapp_opt_out('20000000-0000-0000-0000-000000000001', 'parent1', false);
  raise exception 'homeroom changed a whatsapp flag';
exception
  when others then
    if sqlerrm not like '%רק מזכירות יכולה לסמן שאין וואטסאפ%' then
      raise;
    end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  extra text;
begin
  select parent_phone_2 into extra from public.students limit 1;
  raise exception 'teacher read parent_phone_2';
exception
  when insufficient_privilege then
    null;
end $$;
reset role;

do $$
begin
  if (select parent_phone_no_whatsapp from public.students where id = '20000000-0000-0000-0000-000000000001') is distinct from true then
    raise exception 'whatsapp flag did not stick';
  end if;
end $$;

-- Release time is enforced with the database clock. Homeroom deletes only their class.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  detention uuid;
begin
  insert into public.detentions (student_id, reason_text, duration_minutes)
  values ('20000000-0000-0000-0000-000000000002', 'איחור', 30)
  returning id into detention;
  perform set_config('hishaarut.release_detention', detention::text, false);
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  detention uuid;
begin
  detention := current_setting('hishaarut.release_detention')::uuid;
  begin
    update public.detentions set status = 'completed' where id = detention;
    raise exception 'secretary released before the time';
  exception
    when others then
      if sqlerrm not like '%עדיין לא הגיעה שעת היציאה%' then
        raise;
      end if;
  end;
end $$;
reset role;

update public.detentions
set release_at = now() - interval '1 minute'
where id = current_setting('hishaarut.release_detention')::uuid;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
update public.detentions
set status = 'completed'
where id = current_setting('hishaarut.release_detention')::uuid;
reset role;

insert into public.students (first_name, last_name, gender, class_id)
values ('בדיקה', 'מחיקה', 'male', '10000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  perform public.delete_student('20000000-0000-0000-0000-000000000005', '');
  raise exception 'homeroom deleted a student from another class';
exception
  when others then
    if sqlerrm not like '%אין הרשאה למחוק את התלמיד%' then
      raise;
    end if;
end $$;
select public.delete_student(
  (select id from public.students where first_name = 'בדיקה' and last_name = 'מחיקה'),
  ''
);
reset role;

do $$
begin
  if exists (select 1 from public.students where first_name = 'בדיקה' and last_name = 'מחיקה') then
    raise exception 'homeroom delete of own student did not stick';
  end if;
  if (select status from public.detentions where id = current_setting('hishaarut.release_detention')::uuid) <> 'completed' then
    raise exception 'release after the time did not stick';
  end if;
end $$;

-- A teacher on duty can release once the time has passed. Early release stays admin-only.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  detention uuid;
begin
  insert into public.detentions (student_id, reason_text, duration_minutes)
  values ('20000000-0000-0000-0000-000000000004', 'איחור', 20)
  returning id into detention;
  perform set_config('hishaarut.teacher_release', detention::text, false);
  begin
    update public.detentions
    set status = 'completed', early_release = true
    where id = detention;
    raise exception 'teacher released early';
  exception
    when others then
      if sqlerrm not like '%עדיין לא הגיעה שעת היציאה%' then
        raise;
      end if;
  end;
end $$;
reset role;

update public.detentions
set release_at = now() - interval '1 minute'
where id = current_setting('hishaarut.teacher_release')::uuid;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
update public.detentions
set status = 'completed'
where id = current_setting('hishaarut.teacher_release')::uuid;
reset role;

do $$
declare
  detention uuid := current_setting('hishaarut.teacher_release')::uuid;
begin
  if (select released_by from public.detentions where id = detention)
    is distinct from '30000000-0000-0000-0000-000000000002' then
    raise exception 'released_by was not the teacher';
  end if;
  if (select signed_at from public.detentions where id = detention) is null then
    raise exception 'release time was not recorded';
  end if;
  if (select release_override_by from public.detentions where id = detention) is not null then
    raise exception 'on-time release was recorded as an override';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  detention uuid;
begin
  insert into public.detentions (student_id, reason_text, duration_minutes)
  values ('20000000-0000-0000-0000-000000000006', 'איחור', 40)
  returning id into detention;
  perform set_config('hishaarut.early_release', detention::text, false);
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
set role authenticated;
update public.detentions
set status = 'completed', early_release = true
where id = current_setting('hishaarut.early_release')::uuid;
reset role;

do $$
declare
  detention uuid := current_setting('hishaarut.early_release')::uuid;
begin
  if (select status from public.detentions where id = detention) <> 'completed' then
    raise exception 'admin early release did not stick';
  end if;
  if (select release_override_by from public.detentions where id = detention)
    is distinct from '30000000-0000-0000-0000-000000000001' then
    raise exception 'early release was not recorded on the admin';
  end if;
  if (select released_by from public.detentions where id = detention)
    is distinct from '30000000-0000-0000-0000-000000000001' then
    raise exception 'released_by was not the admin';
  end if;
end $$;

-- A new person can request a role, but cannot assign it. Secretary approves.
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data)
values ('30000000-0000-0000-0000-000000000007', 'new@example.test', '{"full_name":"תלמיד חדש"}');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000007', false);
set role authenticated;
select public.request_staff_role(
  'homeroom',
  array['10000000-0000-0000-0000-000000000003']::uuid[]
);
do $$
begin
  if (select role from public.profiles where id = '30000000-0000-0000-0000-000000000007') is not null then
    raise exception 'request assigned a real role';
  end if;
  if (select requested_role from public.profiles where id = '30000000-0000-0000-0000-000000000007') <> 'homeroom' then
    raise exception 'request was not stored';
  end if;
  begin
    update public.profiles set role = 'teacher' where id = auth.uid();
    raise exception 'pending user set a role';
  exception
    when others then
      if sqlerrm not like '%אין הרשאה לשנות תפקיד%' then
        raise;
      end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.approve_staff_request(
    '30000000-0000-0000-0000-000000000007',
    'teacher',
    '{}'::uuid[]
  );
  raise exception 'teacher approved a request';
exception
  when others then
    if sqlerrm not like '%רק מנהל או מזכירות יכולים לאשר תפקיד%' then
      raise;
    end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
select public.approve_staff_request(
  '30000000-0000-0000-0000-000000000007',
  'teacher',
  '{}'::uuid[]
);
do $$
begin
  perform public.approve_staff_request(
    '30000000-0000-0000-0000-000000000002',
    'admin',
    '{}'::uuid[]
  );
  raise exception 'secretary granted admin through approval';
exception
  when others then
    if sqlerrm not like '%מזכירות לא יכולה למנות או לשנות מנהל%' then
      raise;
    end if;
end $$;
reset role;

do $$
begin
  if (select role from public.profiles where id = '30000000-0000-0000-0000-000000000007') <> 'teacher' then
    raise exception 'secretary approval did not stick';
  end if;
  if (select requested_role from public.profiles where id = '30000000-0000-0000-0000-000000000007') is not null then
    raise exception 'request was not cleared';
  end if;
end $$;

-- Owner: nobody else can change that profile, and only the owner transfers it.
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set is_owner = true where id = '30000000-0000-0000-0000-000000000001';
update public.profiles set role = 'admin' where id = '30000000-0000-0000-0000-000000000006';

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  update public.profiles
  set role = 'teacher'
  where id = '30000000-0000-0000-0000-000000000001';
  raise exception 'other admin demoted the owner';
exception
  when others then
    if sqlerrm not like '%רק בעל המערכת יכול לשנות את הפרופיל שלו%' then
      raise;
    end if;
end $$;
do $$
begin
  perform public.transfer_ownership('30000000-0000-0000-0000-000000000006');
  raise exception 'non-owner transferred ownership';
exception
  when others then
    if sqlerrm not like '%רק בעל המערכת יכול להעביר בעלות%' then
      raise;
    end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  update public.profiles
  set full_name = 'שינוי'
  where id = '30000000-0000-0000-0000-000000000001';
  if found then
    raise exception 'secretary edited the owner';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.transfer_ownership('30000000-0000-0000-0000-000000000006');
reset role;

do $$
begin
  if (select is_owner from public.profiles where id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'previous owner kept the flag';
  end if;
  if not (select is_owner from public.profiles where id = '30000000-0000-0000-0000-000000000006') then
    raise exception 'ownership did not move';
  end if;
  if (select owner_id from public.school_settings where id = 1) <> '30000000-0000-0000-0000-000000000006' then
    raise exception 'settings owner was not updated';
  end if;
  if (select role from public.profiles where id = '30000000-0000-0000-0000-000000000001') <> 'admin' then
    raise exception 'transfer demoted the previous owner';
  end if;
end $$;

-- Homeroom reports stay inside their own class.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  n int;
  foreign_n int;
begin
  select count(*) into n from public.list_report_detentions('2000-01-01', '2100-01-01');
  select count(*) into foreign_n
  from public.list_report_detentions('2000-01-01', '2100-01-01') r
  where r.class_id is distinct from '10000000-0000-0000-0000-000000000001';
  if foreign_n <> 0 then
    raise exception 'homeroom report included another class';
  end if;
end $$;
do $$
begin
  perform public.list_report_detentions('2000-01-01', '2100-01-01');
exception
  when others then
    null;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.list_report_detentions('2000-01-01', '2100-01-01');
  raise exception 'teacher opened a report';
exception
  when others then
    if sqlerrm not like '%אין הרשאה לדוח%' then
      raise;
    end if;
end $$;
reset role;

-- Real school week: 07:00 until the bell. Saturday is closed.
select set_config('request.jwt.claim.sub', '', false);
update public.school_settings set
  start_sun = '07:00', end_sun = '16:00',
  start_mon = '07:00', end_mon = '16:00',
  start_tue = '07:00', end_tue = '14:00',
  start_wed = '07:00', end_wed = '16:00',
  start_thu = '07:00', end_thu = '16:00',
  start_fri = '07:00', end_fri = '12:00',
  start_sat = null, end_sat = null;
delete from public.school_closures;

do $$
declare
  tuesday timestamptz := timestamptz '2026-11-03 10:00:00+02';
  early timestamptz := timestamptz '2026-11-03 06:30:00+02';
  late timestamptz := timestamptz '2026-11-03 15:00:00+02';
  saturday timestamptz := timestamptz '2026-11-07 10:00:00+02';
  shown text;
  long_one text;
begin
  shown := to_char(timezone('Asia/Jerusalem', public.default_release_at(tuesday, 30)), 'YYYY-MM-DD HH24:MI');
  if shown <> '2026-11-03 14:30' then
    raise exception 'tuesday release should be 14:30, got %', shown;
  end if;
  long_one := to_char(timezone('Asia/Jerusalem', public.default_release_at(tuesday, 240)), 'HH24:MI');
  if long_one <> '17:00' then
    raise exception 'release should cap three hours after the bell, got %', long_one;
  end if;
  begin
    perform public.default_release_at(early, 30);
    raise exception 'before the school day should be refused';
  exception
    when others then
      if sqlerrm not like '%סימון השארות פתוח בימי לימודים בין 07:00 ל-14:00%' then
        raise;
      end if;
  end;
  begin
    perform public.default_release_at(late, 30);
    raise exception 'after the bell should be refused';
  exception
    when others then
      if sqlerrm not like '%בין 07:00 ל-14:00%' then
        raise;
      end if;
  end;
  begin
    perform public.default_release_at(saturday, 30);
    raise exception 'saturday should have no school';
  exception
    when others then
      if sqlerrm not like '%בין 07:00 ל-16:00%' then
        raise;
      end if;
  end;
end $$;

insert into public.school_closures (closure_date) values (date '2026-11-03');
do $$
begin
  perform public.default_release_at(timestamptz '2026-11-03 10:00:00+02', 30);
  raise exception 'a holiday should refuse a mark';
exception
  when others then
    if sqlerrm not like '%בין 07:00 ל-14:00%' then
      raise;
    end if;
end $$;
delete from public.school_closures;

-- A missing parent name opens with שלום, and the mother gets her own text.
do $$
declare
  father text;
  mother text;
begin
  father := public.apply_parent_template(null, null, 'יוסף לוי', 'ז׳1', '16:30', 'איחור');
  if father not like 'שלום,%' or father like 'שלום שלום%' then
    raise exception 'missing name should fall back to שלום, got %', father;
  end if;
  mother := public.apply_parent_template(null, 'רחל לוי', 'יוסף לוי', 'ז׳1', '16:30', 'איחור');
  if mother not like 'שלום רחל לוי,%' then
    raise exception 'mother should be addressed by name, got %', mother;
  end if;
  if father = mother then
    raise exception 'father and mother messages should differ';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into public.school_closures (closure_date) values (date '2026-12-01');
  raise exception 'teacher added a holiday';
exception
  when others then
    if sqlerrm not like '%row-level security%' then
      raise;
    end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', false);
set role authenticated;
insert into public.school_closures (closure_date) values (date '2026-12-01');
update public.school_settings set parent_message_template = 'שלום {parent_name}' where id = 1;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  if not exists (select 1 from public.school_closures where closure_date = date '2026-12-01') then
    raise exception 'secretary could not add a holiday';
  end if;
  if (select parent_message_template from public.school_settings where id = 1) <> 'שלום {parent_name}' then
    raise exception 'secretary could not save the parent message';
  end if;
end $$;
