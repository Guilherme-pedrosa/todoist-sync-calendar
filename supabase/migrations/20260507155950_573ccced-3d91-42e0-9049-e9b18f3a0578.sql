CREATE TABLE IF NOT EXISTS public.domain_classifications (
  domain text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('productive','neutral','distracting')),
  confidence text NOT NULL CHECK (confidence IN ('low','medium','high')),
  reasoning text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  classified_by text NOT NULL DEFAULT 'gpt'
);

ALTER TABLE public.domain_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY dc_select_authenticated
  ON public.domain_classifications
  FOR SELECT TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.productivity_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  summary text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]',
  concerns jsonb NOT NULL DEFAULT '[]',
  suggestions jsonb NOT NULL DEFAULT '[]',
  raw_metrics jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT 'gemini-2.5-flash',
  UNIQUE(user_id, workspace_id, period_start, period_end)
);

ALTER TABLE public.productivity_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY pi_select
  ON public.productivity_insights
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_productivity_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_pi_user_period
  ON public.productivity_insights (user_id, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_pi_workspace_period
  ON public.productivity_insights (workspace_id, period_end DESC);

NOTIFY pgrst, 'reload schema';