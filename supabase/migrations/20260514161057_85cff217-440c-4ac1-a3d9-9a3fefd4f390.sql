
CREATE TABLE public.gc_daily_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  gc_user_id text NOT NULL,
  gc_user_name text NOT NULL,
  vendas_count integer NOT NULL DEFAULT 0,
  vendas_valor numeric NOT NULL DEFAULT 0,
  os_count integer NOT NULL DEFAULT 0,
  os_valor numeric NOT NULL DEFAULT 0,
  orcamentos_count integer NOT NULL DEFAULT 0,
  orcamentos_valor numeric NOT NULL DEFAULT 0,
  nfs_count integer NOT NULL DEFAULT 0,
  nfs_valor numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, gc_user_id)
);

CREATE INDEX idx_gc_daily_day ON public.gc_daily_activity(day DESC);
CREATE INDEX idx_gc_daily_user ON public.gc_daily_activity(gc_user_id);

ALTER TABLE public.gc_daily_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "productivity admins can view gc activity"
  ON public.gc_daily_activity FOR SELECT
  USING (public.is_productivity_admin(auth.uid()));

-- Enable extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
