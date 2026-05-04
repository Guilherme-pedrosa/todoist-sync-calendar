DROP POLICY IF EXISTS proj_insert ON public.projects;

CREATE POLICY proj_insert
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND owner_id = auth.uid()
  AND public.is_workspace_member(workspace_id, auth.uid())
);