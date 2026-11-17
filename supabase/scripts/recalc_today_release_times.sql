-- Recalculate today's release times from the school's current hours
-- for this date (weekly Tuesday hours, or a one-off special day if one exists).
--
-- Paste into the Supabase SQL Editor. Run the preview first, look at the
-- results, and only then run the UPDATE (uncomment it).
-- Do not run this as a migration.
--
-- What this uses:
--   school_settings.end_tue (default 14:00) and school_day_for(), which also
--   honors a special day in school_closures for today.
-- It does not invent new hours. If Tuesday's end time in Settings is still
-- 16:00, the preview will show that, and the UPDATE would not shift times
-- off 16:00. In that case set end_tue first (see the optional step).
--
-- Only pending and no_show rows for today's Jerusalem date are considered.
-- Completed releases are left unchanged.
-- A row whose release time was typed in by hand will also be reset if it
-- no longer matches duration + today's end time; the preview flags those.

-- 1) Weekly hours and today's effective hours
select
  s.start_sun, s.end_sun,
  s.start_mon, s.end_mon,
  s.start_tue, s.end_tue,
  s.start_wed, s.end_wed,
  s.start_thu, s.end_thu,
  s.start_fri, s.end_fri,
  s.start_sat, s.end_sat
from public.school_settings s
where s.id = 1;

select
  day.local_date as today,
  to_char(day.start_clock, 'HH24:MI') as start_clock,
  to_char(day.end_clock, 'HH24:MI') as end_clock,
  day.closed,
  c.start_clock as special_start,
  c.end_clock as special_end
from public.school_day_for(timezone('Asia/Jerusalem', now())) day
left join public.school_closures c on c.closure_date = day.local_date;

-- Optional, only if end_tue is not already 14:00 and you want the original
-- Tuesday schedule (14:00) before recalculating:
-- update public.school_settings
-- set end_tue = time '14:00'
-- where id = 1 and end_tue is distinct from time '14:00';

-- 2) Preview: current release vs duration + today's end time
with today as (
  select (timezone('Asia/Jerusalem', now()))::date as local_date
),
day as (
  select *
  from public.school_day_for(((select local_date from today) + time '12:00') at time zone 'Asia/Jerusalem')
),
computed as (
  select
    d.id,
    st.first_name,
    st.last_name,
    c.name as class_name,
    d.status,
    d.duration_minutes,
    d.marked_at,
    d.release_at,
    (day.local_date + day.end_clock) at time zone 'Asia/Jerusalem' as day_end,
    least(
      (day.local_date + day.end_clock) at time zone 'Asia/Jerusalem'
        + make_interval(mins => d.duration_minutes),
      (day.local_date + day.end_clock) at time zone 'Asia/Jerusalem'
        + interval '3 hours',
      ((day.local_date + 1) at time zone 'Asia/Jerusalem') - interval '1 minute'
    ) as new_release_at,
    (day.local_date + time '16:00') at time zone 'Asia/Jerusalem'
      + make_interval(mins => d.duration_minutes) as weekday_1600_release_at
  from public.detentions d
  join public.students st on st.id = d.student_id
  left join public.classes c on c.id = st.class_id
  cross join day
  where d.detention_date = (select local_date from today)
    and d.status in ('pending', 'no_show')
)
select
  first_name,
  last_name,
  class_name,
  status,
  duration_minutes,
  to_char(timezone('Asia/Jerusalem', release_at), 'HH24:MI') as current_release,
  to_char(timezone('Asia/Jerusalem', new_release_at), 'HH24:MI') as recalculated_release,
  to_char(timezone('Asia/Jerusalem', day_end), 'HH24:MI') as today_end,
  release_at is distinct from new_release_at as will_change,
  abs(extract(epoch from (release_at - weekday_1600_release_at))) < 60 as looks_like_1600_default
from computed
order by last_name, first_name;

-- 3) Apply the recalculation (uncomment after reviewing the preview).
-- update public.detentions d
-- set
--   release_at = computed.new_release_at,
--   updated_at = now()
-- from (
--   with today as (
--     select (timezone('Asia/Jerusalem', now()))::date as local_date
--   ),
--   day as (
--     select *
--     from public.school_day_for(((select local_date from today) + time '12:00') at time zone 'Asia/Jerusalem')
--   )
--   select
--     d.id,
--     least(
--       (day.local_date + day.end_clock) at time zone 'Asia/Jerusalem'
--         + make_interval(mins => d.duration_minutes),
--       (day.local_date + day.end_clock) at time zone 'Asia/Jerusalem'
--         + interval '3 hours',
--       ((day.local_date + 1) at time zone 'Asia/Jerusalem') - interval '1 minute'
--     ) as new_release_at
--   from public.detentions d
--   cross join day
--   where d.detention_date = (select local_date from today)
--     and d.status in ('pending', 'no_show')
-- ) computed
-- where d.id = computed.id
--   and d.release_at is distinct from computed.new_release_at
--   and d.status in ('pending', 'no_show');
