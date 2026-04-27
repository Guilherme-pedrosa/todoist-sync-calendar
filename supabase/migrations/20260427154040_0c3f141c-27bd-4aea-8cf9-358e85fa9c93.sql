-- Phase 1 closeout

-- 1. projects: view_type + description
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS view_type text NOT NULL DEFAULT 'list',
  ADD COLUMN IF NOT EXISTS description text;

-- 2. sections: is_collapsed
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS is_collapsed boolean NOT NULL DEFAULT false;

-- 3. labels: is_favorite
ALTER TABLE public.labels
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

-- 4. reminders: relative_minutes + channel
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS relative_minutes integer,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'push';

-- 5. user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY,
  language text NOT NULL DEFAULT 'pt-BR',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  time_format text NOT NULL DEFAULT '24h',
  date_format text NOT NULL DEFAULT 'DD-MM-YYYY',
  week_start smallint NOT NULL DEFAULT 1,
  home_page text NOT NULL DEFAULT 'today',
  smart_date_recognition boolean NOT NULL DEFAULT true,
  theme text NOT NULL DEFAULT 'todoist',
  auto_dark_mode boolean NOT NULL DEFAULT false,
  default_reminder_minutes integer NOT NULL DEFAULT 30,
  reminder_channels jsonb NOT NULL DEFAULT '["push","email"]'::jsonb,
  daily_goal integer NOT NULL DEFAULT 5,
  weekly_goal integer NOT NULL DEFAULT 30,
  vacation_mode boolean NOT NULL DEFAULT false,
  days_off jsonb NOT NULL DEFAULT '["6","0"]'::jsonb,
  karma_enabled boolean NOT NULL DEFAULT true,
  quick_add_chips jsonb NOT NULL DEFAULT '["date","deadline","assignee","attachment","priority","reminders"]'::jsonb,
  sidebar_order jsonb NOT NULL DEFAULT '["inbox","today","upcoming","completed","more"]'::jsonb,
  sidebar_hidden jsonb NOT NULL DEFAULT '[]'::jsonb,
  show_task_description boolean NOT NULL DEFAULT true,
  celebrations boolean NOT NULL DEFAULT true,
  delete_calendar_event_on_complete boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS view_own_settings ON public.user_settings;
CREATE POLICY view_own_settings ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_own_settings ON public.user_settings;
CREATE POLICY insert_own_settings ON public.user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS update_own_settings ON public.user_settings;
CREATE POLICY update_own_settings ON public.user_settings
  FOR UPDATE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Trigger to create user_settings on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_settings();

-- 7. Backfill user_settings for existing users
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
