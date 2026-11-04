-- Step 1 of 2: new detention status "did not show up" (לא הגיע).
-- Run this file by itself first (Postgres needs the new enum value committed
-- before other SQL can use it). Safe to paste again.
alter type public.detention_status add value if not exists 'no_show';
