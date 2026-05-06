DROP POLICY IF EXISTS tasks_insert ON public.tasks;

CREATE POLICY tasks_insert
ON public.tasks
FOR INSERT
TO public
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND (created_by IS NULL OR created_by = auth.uid())
  AND project_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.project_members pm
      ON pm.project_id = p.id AND pm.user_id = auth.uid()
    LEFT JOIN public.workspace_members wm
      ON wm.workspace_id = p.workspace_id AND wm.user_id = auth.uid()
    LEFT JOIN public.team_members tm
      ON tm.team_id = p.team_id AND tm.user_id = auth.uid()
    LEFT JOIN public.project_teams pt
      ON pt.project_id = p.id
    LEFT JOIN public.team_members ptm
      ON ptm.team_id = pt.team_id AND ptm.user_id = auth.uid()
    WHERE p.id = tasks.project_id
      AND p.workspace_id = tasks.workspace_id
      AND (
        p.owner_id = auth.uid()
        OR pm.user_id IS NOT NULL
        OR (p.visibility = 'workspace' AND wm.user_id IS NOT NULL)
        OR (p.visibility = 'team' AND tm.user_id IS NOT NULL)
        OR ptm.user_id IS NOT NULL
      )
  )
);

NOTIFY pgrst, 'reload schema';