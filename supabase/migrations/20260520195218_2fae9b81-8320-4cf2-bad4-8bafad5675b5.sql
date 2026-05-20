
ALTER TABLE public.project_announcements
  ADD COLUMN IF NOT EXISTS content_below text;
