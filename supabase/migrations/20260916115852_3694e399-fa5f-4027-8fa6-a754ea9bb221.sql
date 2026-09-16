CREATE TABLE public.announcement_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES public.project_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL DEFAULT '👍',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.announcement_reactions TO authenticated;
GRANT ALL ON public.announcement_reactions TO service_role;
ALTER TABLE public.announcement_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select" ON public.announcement_reactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_announcements pa WHERE pa.id = announcement_id AND public.has_project_access(pa.project_id, auth.uid())));

CREATE POLICY "reactions_insert" ON public.announcement_reactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.project_announcements pa WHERE pa.id = announcement_id AND public.has_project_access(pa.project_id, auth.uid())));

CREATE POLICY "reactions_delete" ON public.announcement_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TABLE public.announcement_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES public.project_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_comments TO authenticated;
GRANT ALL ON public.announcement_comments TO service_role;
ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_comments_select" ON public.announcement_comments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_announcements pa WHERE pa.id = announcement_id AND public.has_project_access(pa.project_id, auth.uid())));

CREATE POLICY "ann_comments_insert" ON public.announcement_comments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.project_announcements pa WHERE pa.id = announcement_id AND public.has_project_access(pa.project_id, auth.uid())));

CREATE POLICY "ann_comments_update" ON public.announcement_comments FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "ann_comments_delete" ON public.announcement_comments FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_ann_reactions_ann ON public.announcement_reactions(announcement_id);
CREATE INDEX idx_ann_comments_ann ON public.announcement_comments(announcement_id);

ALTER TABLE public.announcement_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.announcement_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_comments;