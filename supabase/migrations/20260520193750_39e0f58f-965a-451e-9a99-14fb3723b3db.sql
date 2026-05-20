
-- Table
CREATE TABLE public.project_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_announcements_project ON public.project_announcements(project_id, created_at DESC);

ALTER TABLE public.project_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY pa_select ON public.project_announcements
  FOR SELECT USING (has_project_access(project_id, auth.uid()));

CREATE POLICY pa_insert ON public.project_announcements
  FOR INSERT WITH CHECK (auth.uid() = user_id AND has_project_access(project_id, auth.uid()));

CREATE POLICY pa_update ON public.project_announcements
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY pa_delete ON public.project_announcements
  FOR DELETE USING (auth.uid() = user_id OR project_role(project_id, auth.uid()) = 'admin'::project_role);

CREATE TRIGGER trg_pa_updated_at
  BEFORE UPDATE ON public.project_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('project-announcements', 'project-announcements', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pa_obj_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'project-announcements'
    AND has_project_access(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "pa_obj_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'project-announcements'
    AND has_project_access(((storage.foldername(name))[1])::uuid, auth.uid())
    AND owner = auth.uid()
  );

CREATE POLICY "pa_obj_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'project-announcements'
    AND owner = auth.uid()
  );
