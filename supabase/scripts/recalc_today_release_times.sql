-- Preview today's release times as 14:30 + duration.
-- Does not change school_settings.end_tue (already set to 14:30 in Settings).
-- Paste into the Supabase SQL Editor. Run the preview first.
-- Leave the UPDATE commented until you have reviewed the results.
-- Only pending and no_show rows for today's Jerusalem date are considered.
-- Completed releases are left unchanged.

-- 1) Assert Tuesday weekly end is 14:30 (read-only; no update).
select
  to_char(end_tue, 'HH24:MI') as end_tue,
  (end_tue = time '14:30') as tuesday_is_1430
from public.school_settings
where id = 1;

-- 2) Preview: current release vs 14:30 + duration (capped at 17:30).
with today as (
  select (timezone('Asia/Jerusalem', now()))::date as local_date
)
select
  st.first_name,
  st.last_name,
  c.name as class_name,
  d.status,
  d.duration_minutes,
  to_char(timezone('Asia/Jerusalem', d.release_at), 'HH24:MI') as current_release,
  to_char(
    timezone(
      'Asia/Jerusalem',
      least(
        (today.local_date + time '14:30') at time zone 'Asia/Jerusalem'
          + make_interval(mins => d.duration_minutes),
        (today.local_date + time '14:30') at time zone 'Asia/Jerusalem'
          + interval '3 hours'
      )
    ),
    'HH24:MI'
  ) as recalculated_release,
  d.release_at is distinct from least(
    (today.local_date + time '14:30') at time zone 'Asia/Jerusalem'
      + make_interval(mins => d.duration_minutes),
    (today.local_date + time '14:30') at time zone 'Asia/Jerusalem'
      + interval '3 hours'
  ) as will_change
from public.detentions d
join public.students st on st.id = d.student_id
left join public.classes c on c.id = st.class_id
cross join today
where d.detention_date = today.local_date
  and d.status in ('pending', 'no_show')
order by st.last_name, st.first_name;

-- 3) Apply the recalculation (uncomment after reviewing the preview).
-- update public.detentions d
-- set
--   release_at = least(
--     (((timezone('Asia/Jerusalem', now()))::date + time '14:30') at time zone 'Asia/Jerusalem')
--       + make_interval(mins => d.duration_minutes),
--     (((timezone('Asia/Jerusalem', now()))::date + time '14:30') at time zone 'Asia/Jerusalem')
--       + interval '3 hours'
--   ),
--   updated_at = now()
-- where d.detention_date = (timezone('Asia/Jerusalem', now()))::date
--   and d.status in ('pending', 'no_show')
--   and d.release_at is distinct from least(
--     (((timezone('Asia/Jerusalem', now()))::date + time '14:30') at time zone 'Asia/Jerusalem')
--       + make_interval(mins => d.duration_minutes),
--     (((timezone('Asia/Jerusalem', now()))::date + time '14:30') at time zone 'Asia/Jerusalem')
--       + interval '3 hours'
--   );
