ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS todoist_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_todoist_id_per_user
  ON public.tasks (user_id, todoist_id)
  WHERE todoist_id IS NOT NULL AND deleted_at IS NULL;
NOTIFY pgrst, 'reload schema';