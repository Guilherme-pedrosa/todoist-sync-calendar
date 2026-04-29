CREATE TABLE public.transkriptor_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transkriptor_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own transkriptor key select"
  ON public.transkriptor_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users manage own transkriptor key insert"
  ON public.transkriptor_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users manage own transkriptor key update"
  ON public.transkriptor_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users manage own transkriptor key delete"
  ON public.transkriptor_keys FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_transkriptor_keys_updated
  BEFORE UPDATE ON public.transkriptor_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();