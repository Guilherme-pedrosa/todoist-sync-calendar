
CREATE TABLE IF NOT EXISTS public.gc_sync_status (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle',
  stage text,
  progress int NOT NULL DEFAULT 0,
  data_inicio date,
  data_fim date,
  buckets int,
  fetched jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gc_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gc_sync_status read for authenticated"
ON public.gc_sync_status FOR SELECT
TO authenticated
USING (true);
