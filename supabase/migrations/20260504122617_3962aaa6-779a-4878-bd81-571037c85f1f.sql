
-- Visitas a URLs (capturadas pela extensão)
CREATE TABLE public.activity_url_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  session_id UUID,
  domain TEXT NOT NULL,
  path TEXT,
  title TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  was_focused BOOLEAN NOT NULL DEFAULT true,
  was_idle BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_uv_user_started ON public.activity_url_visits(user_id, started_at DESC);
CREATE INDEX idx_uv_workspace_started ON public.activity_url_visits(workspace_id, started_at DESC);
CREATE INDEX idx_uv_domain ON public.activity_url_visits(workspace_id, domain);

ALTER TABLE public.activity_url_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY uv_insert ON public.activity_url_visits
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY uv_update ON public.activity_url_visits
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY uv_select ON public.activity_url_visits
  FOR SELECT USING (can_view_activity(user_id, workspace_id, auth.uid()));

-- Categorização de domínios por workspace
CREATE TABLE public.domain_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('productive','neutral','distracting')),
  color TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

ALTER TABLE public.domain_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY dc_select ON public.domain_categories
  FOR SELECT USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY dc_cud ON public.domain_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  );

-- Campos extras para daily_activity_stats
ALTER TABLE public.daily_activity_stats
  ADD COLUMN IF NOT EXISTS productive_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS neutral_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distracting_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_domains JSONB NOT NULL DEFAULT '[]'::jsonb;
