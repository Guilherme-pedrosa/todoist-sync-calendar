ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS next_week_start text NOT NULL DEFAULT 'monday',
  ADD COLUMN IF NOT EXISTS color_mode text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS show_sidebar_counts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_calendar_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_task_complete boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_comments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_reminders boolean NOT NULL DEFAULT true;

UPDATE public.user_settings
SET next_week_start = COALESCE(next_week_start, 'monday'),
    color_mode = COALESCE(color_mode, 'system');