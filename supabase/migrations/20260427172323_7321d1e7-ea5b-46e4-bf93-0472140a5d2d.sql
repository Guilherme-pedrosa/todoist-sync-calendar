
-- Add dismissed_install_prompt to user_settings for PWA install banner
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS dismissed_install_prompt boolean NOT NULL DEFAULT false;

-- Add fired_at to reminders for cron processing (kept old notification_sent for backwards compat)
ALTER TABLE public.reminders
ADD COLUMN IF NOT EXISTS fired_at timestamp with time zone;
