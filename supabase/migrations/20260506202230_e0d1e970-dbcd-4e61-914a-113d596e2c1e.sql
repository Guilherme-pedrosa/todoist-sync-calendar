ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON public.tasks (deleted_at) WHERE deleted_at IS NOT NULL;
NOTIFY pgrst, 'reload schema';