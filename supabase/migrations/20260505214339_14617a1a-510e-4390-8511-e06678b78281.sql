DROP POLICY IF EXISTS tasks_select ON public.tasks;

CREATE POLICY tasks_select
ON public.tasks
FOR SELECT
USING (public.has_task_access(id, auth.uid()));