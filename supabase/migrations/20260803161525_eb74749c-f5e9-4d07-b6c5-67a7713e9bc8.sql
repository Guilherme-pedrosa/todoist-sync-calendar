CREATE TABLE public.gamification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_goal INTEGER NOT NULL DEFAULT 5,
  weekly_goal INTEGER NOT NULL DEFAULT 25,
  monthly_goal INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_settings TO authenticated;
GRANT ALL ON public.gamification_settings TO service_role;

ALTER TABLE public.gamification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gamification settings"
ON public.gamification_settings FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_gamification_settings_updated_at
BEFORE UPDATE ON public.gamification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();