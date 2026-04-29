-- Lock down backup tables (RLS on, no policies = no access via PostgREST)
ALTER TABLE public.projects_backup_pre_phase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks_backup_pre_phase1    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels_backup_pre_phase1   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects_backup_pre_phase4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks_backup_pre_phase4    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels_backup_pre_phase4   ENABLE ROW LEVEL SECURITY;

-- Restrict SECURITY DEFINER helpers to authenticated users only
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.workspace_role(uuid, uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_project_access(uuid, uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.project_role(uuid, uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_task_access(uuid, uuid)      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_role(uuid, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_project_access(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_role(uuid, uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_task_access(uuid, uuid)      TO authenticated;