DROP POLICY IF EXISTS tasks_update ON public.tasks;

CREATE POLICY tasks_update
ON public.tasks
FOR UPDATE
USING (public.has_task_access(id, auth.uid()))
WITH CHECK (public.has_task_access(id, auth.uid()));

DROP POLICY IF EXISTS tasks_delete ON public.tasks;

CREATE POLICY tasks_delete
ON public.tasks
FOR DELETE
USING (public.has_task_access(id, auth.uid()));