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
  AND public.has_project_access(project_id, auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = tasks.project_id
      AND p.workspace_id = tasks.workspace_id
  )
);

NOTIFY pgrst, 'reload schema';