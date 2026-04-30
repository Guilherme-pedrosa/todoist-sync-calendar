CREATE TABLE IF NOT EXISTS public.recurring_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  occurrence_date date NOT NULL,
  occurrence_time time without time zone,
  duration_minutes integer,
  title text NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id, occurrence_date)
);

ALTER TABLE public.recurring_task_completions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_recurring_task_completions_task_date
  ON public.recurring_task_completions (task_id, occurrence_date);

CREATE INDEX IF NOT EXISTS idx_recurring_task_completions_user_date
  ON public.recurring_task_completions (user_id, occurrence_date);

DROP POLICY IF EXISTS rtc_select ON public.recurring_task_completions;
DROP POLICY IF EXISTS rtc_insert ON public.recurring_task_completions;
DROP POLICY IF EXISTS rtc_delete ON public.recurring_task_completions;

CREATE POLICY rtc_select
ON public.recurring_task_completions
FOR SELECT
USING (public.has_task_access(task_id, auth.uid()));

CREATE POLICY rtc_insert
ON public.recurring_task_completions
FOR INSERT
WITH CHECK (auth.uid() = user_id AND public.has_task_access(task_id, auth.uid()));

CREATE POLICY rtc_delete
ON public.recurring_task_completions
FOR DELETE
USING (auth.uid() = user_id AND public.has_task_access(task_id, auth.uid()));