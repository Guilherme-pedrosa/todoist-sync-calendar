DROP POLICY IF EXISTS tasks_insert ON public.tasks;

CREATE POLICY tasks_insert
ON public.tasks
FOR INSERT
TO public
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.role() = 'authenticated'
  AND user_id = auth.uid()
  AND (created_by IS NULL OR created_by = auth.uid())
  AND project_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND public.can_insert_task(project_id, workspace_id, auth.uid())
);

GRANT EXECUTE ON FUNCTION public.can_insert_task(uuid, uuid, uuid) TO public, anon, authenticated;
NOTIFY pgrst, 'reload schema';