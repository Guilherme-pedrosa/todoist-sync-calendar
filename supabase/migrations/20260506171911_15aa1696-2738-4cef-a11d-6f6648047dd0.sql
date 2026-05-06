DROP POLICY IF EXISTS tasks_insert ON public.tasks;

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND public.has_project_access(project_id, auth.uid())
  );

NOTIFY pgrst, 'reload schema';