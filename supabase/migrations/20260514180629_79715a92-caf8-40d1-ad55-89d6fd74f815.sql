ALTER TABLE public.gc_sync_status
  ADD COLUMN IF NOT EXISTS log_range_start date,
  ADD COLUMN IF NOT EXISTS activity_total integer;
