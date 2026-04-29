-- Remove duplicate active tasks for the same user/title/date/time before adding the guard.
WITH ranked_duplicates AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        user_id,
        lower(trim(regexp_replace(title, '^✅\s*', ''))),
        due_date,
        COALESCE(due_time, TIME '00:00:00')
      ORDER BY
        CASE WHEN google_calendar_event_id IS NOT NULL THEN 0 ELSE 1 END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.tasks
  WHERE completed = false
    AND due_date IS NOT NULL
)
DELETE FROM public.tasks t
USING ranked_duplicates d
WHERE t.id = d.id
  AND d.rn > 1;

-- Prevent future duplicate active tasks in the same user/date/time slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_unique_active_title_day_time
ON public.tasks (
  user_id,
  lower(trim(regexp_replace(title, '^✅\s*', ''))),
  due_date,
  COALESCE(due_time, TIME '00:00:00')
)
WHERE completed = false
  AND due_date IS NOT NULL;