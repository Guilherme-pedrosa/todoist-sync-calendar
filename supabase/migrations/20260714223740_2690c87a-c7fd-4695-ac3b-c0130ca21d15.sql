
CREATE TABLE public.dashboard_orcamento_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  auvo_tecnico_name text,
  enabled boolean NOT NULL DEFAULT false,
  goal_count integer NOT NULL DEFAULT 0,
  goal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_orcamento_settings TO authenticated;
GRANT ALL ON public.dashboard_orcamento_settings TO service_role;

ALTER TABLE public.dashboard_orcamento_settings ENABLE ROW LEVEL SECURITY;

-- Own row read
CREATE POLICY "own read" ON public.dashboard_orcamento_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_productivity_admin(auth.uid()));

CREATE POLICY "admin write" ON public.dashboard_orcamento_settings
  FOR ALL TO authenticated
  USING (public.is_productivity_admin(auth.uid()))
  WITH CHECK (public.is_productivity_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_dashboard_orcamento_settings()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_touch_dashboard_orcamento_settings
BEFORE UPDATE ON public.dashboard_orcamento_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_dashboard_orcamento_settings();
