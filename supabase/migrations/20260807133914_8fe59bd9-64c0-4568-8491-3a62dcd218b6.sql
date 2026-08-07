CREATE TABLE public.plaud_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  external_id text,
  title text NOT NULL DEFAULT 'Reunião Plaud',
  meeting_date timestamptz,
  duration_minutes numeric,
  language text,
  summary text,
  transcript text,
  audio_url text,
  source text NOT NULL DEFAULT 'plaud',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX plaud_meetings_user_external_key
  ON public.plaud_meetings (user_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX plaud_meetings_user_date_idx ON public.plaud_meetings (user_id, meeting_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plaud_meetings TO authenticated;
GRANT ALL ON public.plaud_meetings TO service_role;

ALTER TABLE public.plaud_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own plaud meetings"
ON public.plaud_meetings FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_plaud_meetings_updated_at
BEFORE UPDATE ON public.plaud_meetings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();