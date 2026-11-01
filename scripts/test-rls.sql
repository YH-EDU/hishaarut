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
    raise exception 'teacher completed a detention';
  exception
    when others then
      if sqlerrm not like '%אין הרשאה לאשר סיום%' then
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
  where n.detention_id = detention and n.event = 'marked' and n.recipient_type = 'parent';

  if parent_status <> 'pending' or parent_phone <> '972507000001' then
    raise exception 'parent notification was not queued';
  end if;
  if parent_body <> E'שלום, הודעה מבית הספר:\nנועה ברק נשארה היום אחרי שעות הלימודים.\nסיבה: הפרעה בשיעור\nמשך: 30 דקות.' then
    raise exception 'unexpected parent message: %', parent_body;
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
      if sqlerrm not like '%רק מנהל יכול לשנות תפקיד%' then
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

-- Domain lock rejects a new Google account. Existing users stay.
-- Clear the test JWT so this runs as the database owner, like the SQL editor.
select set_config('request.jwt.claim.sub', '', false);
update public.school_settings set allowed_email_domain = 'school.test' where id = 1;
do $$
begin
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values ('30000000-0000-0000-0000-000000000099', 'person@gmail.com', '{}');
    raise exception 'foreign domain was accepted';
  exception
    when others then
      if sqlerrm not like '%הדומיין של חשבון הגוגל אינו מורשה%' then
        raise;
      end if;
  end;
  insert into auth.users (id, email, raw_user_meta_data)
  values ('30000000-0000-0000-0000-000000000098', 'person@school.test', '{"name":"תלמיד מורה"}');
end $$;

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
