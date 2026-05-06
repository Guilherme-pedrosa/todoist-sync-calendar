DROP POLICY IF EXISTS tasks_insert ON public.tasks;

CREATE POLICY tasks_insert
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND (created_by IS NULL OR created_by = auth.uid())
  AND project_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND public.can_insert_task(project_id, workspace_id, auth.uid())
);

NOTIFY pgrst, 'reload schema';