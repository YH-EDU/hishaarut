-- Tuesday school day now ends at 14:30 (was 14:00).
-- Only updates the column default for new rows / fresh setups.
-- Does not overwrite school_settings.end_tue if already set.
-- Safe to paste again.

alter table public.school_settings
  alter column end_tue set default time '14:30';
