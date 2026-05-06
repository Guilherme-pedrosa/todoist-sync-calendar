CREATE OR REPLACE FUNCTION public.task_insert_check(
  _project_id uuid,
  _user_id uuid,
  _workspace_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND _user_id = auth.uid()
    AND _project_id IS NOT NULL
    AND public.has_project_access(_project_id, auth.uid())
    AND (
      _workspace_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = _project_id
          AND p.workspace_id = _workspace_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.task_insert_check(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_insert_check(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (public.task_insert_check(project_id, user_id, workspace_id));