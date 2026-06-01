DROP INDEX IF EXISTS public.idx_tasks_unique_active_title_day_time;

CREATE UNIQUE INDEX idx_tasks_unique_active_title_day_time
ON public.tasks (
  user_id,
  lower(trim(regexp_replace(title, '^✅\s*', ''))),
  due_date,
  (due_time IS NULL),
  COALESCE(due_time, '00:00:00'::time without time zone)
)
WHERE completed = false
  AND due_date IS NOT NULL
  AND deleted_at IS NULL;