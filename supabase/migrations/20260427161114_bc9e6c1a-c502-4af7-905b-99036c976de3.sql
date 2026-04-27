ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER TABLE public.comments REPLICA IDENTITY FULL;