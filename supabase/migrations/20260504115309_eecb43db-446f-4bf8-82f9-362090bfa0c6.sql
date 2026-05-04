-- ============================================
-- Workspace tracking settings
-- ============================================
CREATE TABLE public.workspace_tracking_settings (
  workspace_id uuid PRIMARY KEY,
  enable_team_visibility boolean NOT NULL DEFAULT false,
  idle_threshold_minutes integer NOT NULL DEFAULT 5,
  heartbeat_seconds integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.workspace_tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY wts_select ON public.workspace_tracking_settings
  FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY wts_cud ON public.workspace_tracking_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.workspaces w
            WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces w
            WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  );

-- ============================================
-- Helper: workspace owner check
-- ============================================
CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND owner_id = _user_id
  );
$$;

-- Helper: can the current user view another user's activity in a workspace?
CREATE OR REPLACE FUNCTION public.can_view_activity(_target_user uuid, _workspace_id uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- the user themselves
    _target_user = _viewer
    -- or workspace owner
    OR EXISTS (SELECT 1 FROM public.workspaces w
               WHERE w.id = _workspace_id AND w.owner_id = _viewer)
    -- or workspace admin AND team visibility enabled
    OR (
      EXISTS (SELECT 1 FROM public.workspace_members wm
              WHERE wm.workspace_id = _workspace_id
                AND wm.user_id = _viewer
                AND wm.role IN ('owner','admin'))
      AND COALESCE(
        (SELECT enable_team_visibility FROM public.workspace_tracking_settings
         WHERE workspace_id = _workspace_id),
        false)
    );
$$;

-- ============================================
-- activity_sessions
-- ============================================
CREATE TABLE public.activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  active_seconds integer NOT NULL DEFAULT 0,
  idle_seconds integer NOT NULL DEFAULT 0,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_act_sessions_user_started ON public.activity_sessions(user_id, started_at DESC);
CREATE INDEX idx_act_sessions_workspace_started ON public.activity_sessions(workspace_id, started_at DESC);
CREATE INDEX idx_act_sessions_open ON public.activity_sessions(user_id) WHERE ended_at IS NULL;

ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY as_insert ON public.activity_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY as_update ON public.activity_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY as_select ON public.activity_sessions
  FOR SELECT USING (public.can_view_activity(user_id, workspace_id, auth.uid()));

-- ============================================
-- activity_heartbeats
-- ============================================
CREATE TABLE public.activity_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  is_focused boolean NOT NULL DEFAULT true,
  route text,
  interactions integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_act_hb_user_ts ON public.activity_heartbeats(user_id, ts DESC);
CREATE INDEX idx_act_hb_session ON public.activity_heartbeats(session_id, ts);
CREATE INDEX idx_act_hb_workspace_ts ON public.activity_heartbeats(workspace_id, ts DESC);

ALTER TABLE public.activity_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY ah_insert ON public.activity_heartbeats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY ah_select ON public.activity_heartbeats
  FOR SELECT USING (public.can_view_activity(user_id, workspace_id, auth.uid()));

-- ============================================
-- activity_idle_periods
-- ============================================
CREATE TABLE public.activity_idle_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_act_idle_user_started ON public.activity_idle_periods(user_id, started_at DESC);

ALTER TABLE public.activity_idle_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY aip_insert ON public.activity_idle_periods
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY aip_update ON public.activity_idle_periods
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY aip_select ON public.activity_idle_periods
  FOR SELECT USING (public.can_view_activity(user_id, workspace_id, auth.uid()));

-- ============================================
-- daily_activity_stats
-- ============================================
CREATE TABLE public.daily_activity_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  day date NOT NULL,
  active_seconds integer NOT NULL DEFAULT 0,
  idle_seconds integer NOT NULL DEFAULT 0,
  online_seconds integer NOT NULL DEFAULT 0,
  sessions_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  tasks_completed integer NOT NULL DEFAULT 0,
  tasks_completed_with_project integer NOT NULL DEFAULT 0,
  tasks_completed_inbox integer NOT NULL DEFAULT 0,
  activity_score integer NOT NULL DEFAULT 0,
  hourly_buckets jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"0": 120, "1": 0, ...} active seconds per hour
  by_project jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {"<project_id>": {"name": "...", "tasks": 3, "seconds": 0}}
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, day)
);

CREATE INDEX idx_das_workspace_day ON public.daily_activity_stats(workspace_id, day DESC);
CREATE INDEX idx_das_user_day ON public.daily_activity_stats(user_id, day DESC);

ALTER TABLE public.daily_activity_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY das_select ON public.daily_activity_stats
  FOR SELECT USING (public.can_view_activity(user_id, workspace_id, auth.uid()));

-- service role bypasses RLS, used by the aggregator function
