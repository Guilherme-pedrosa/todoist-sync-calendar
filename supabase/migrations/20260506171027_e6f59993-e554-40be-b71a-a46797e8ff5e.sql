DROP POLICY IF EXISTS tasks_insert ON public.tasks;

CREATE POLICY tasks_insert ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_project_access(project_id, auth.uid())
);