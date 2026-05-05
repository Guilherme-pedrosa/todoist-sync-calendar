CREATE OR REPLACE FUNCTION public._debug_filipe_sees_rio()
RETURNS TABLE(has_proj boolean, has_task boolean, ws_member boolean, proj_visibility text)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT
    public.has_project_access('80c4afb0-588b-45f9-8eae-3cf6ebdf15b4'::uuid, '282e1b6d-259b-44f9-b79c-c7641cb603f2'::uuid),
    public.has_task_access('dbe97144-63fe-4217-8966-45f966f77615'::uuid, '282e1b6d-259b-44f9-b79c-c7641cb603f2'::uuid),
    EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id='8fb211d8-3943-42b1-bc74-d925a9709180' AND user_id='282e1b6d-259b-44f9-b79c-c7641cb603f2'),
    (SELECT visibility::text FROM projects WHERE id='80c4afb0-588b-45f9-8eae-3cf6ebdf15b4');
$$;