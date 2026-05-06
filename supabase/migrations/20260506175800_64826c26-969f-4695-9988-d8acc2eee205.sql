CREATE OR REPLACE FUNCTION public.can_insert_task(_project_id uuid, _workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.project_members pm
      ON pm.project_id = p.id AND pm.user_id = _user_id
    LEFT JOIN public.workspace_members wm
      ON wm.workspace_id = p.workspace_id AND wm.user_id = _user_id
    LEFT JOIN public.project_teams pt
      ON pt.project_id = p.id
    LEFT JOIN public.team_members ptm
      ON ptm.team_id = pt.team_id AND ptm.user_id = _user_id
    WHERE p.id = _project_id
      AND p.workspace_id = _workspace_id
      AND (
        p.owner_id = _user_id
        OR pm.user_id IS NOT NULL
        OR wm.user_id IS NOT NULL
        OR ptm.user_id IS NOT NULL
      )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.can_insert_task(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_task(uuid, uuid, uuid) TO anon;

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