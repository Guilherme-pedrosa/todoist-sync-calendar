
ALTER TABLE public.gc_sync_status
  ADD COLUMN IF NOT EXISTS log_page integer,
  ADD COLUMN IF NOT EXISTS log_total_pages integer,
  ADD COLUMN IF NOT EXISTS bucket_state jsonb,
  ADD COLUMN IF NOT EXISTS phase text;
