
-- ============================================================================
-- ESTADO CANÔNICO da camada de tasks/policies/triggers
-- Substitui as definições espalhadas em migrations 20260506*.sql.
-- Não remova; é a única fonte de verdade para auditoria.
-- ============================================================================

-- 1. Função canônica can_insert_task
CREATE OR REPLACE FUNCTION public.can_insert_task(
  _project_id uuid, _workspace_id uuid, _user_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT EXISTS (
  SELECT 1
  FROM public.projects p
  LEFT JOIN public.project_members pm ON pm.project_id = p.id AND pm.user_id = _user_id
  LEFT JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = _user_id
  LEFT JOIN public.team_members tm ON tm.team_id = p.team_id AND tm.user_id = _user_id
  LEFT JOIN public.project_teams pt ON pt.project_id = p.id
  LEFT JOIN public.team_members ptm ON ptm.team_id = pt.team_id AND ptm.user_id = _user_id
  WHERE p.id = _project_id AND p.workspace_id = _workspace_id
    AND (
      p.owner_id = _user_id
      OR pm.user_id IS NOT NULL
      OR (p.visibility = 'workspace' AND wm.user_id IS NOT NULL)
      OR (p.visibility = 'team' AND tm.user_id IS NOT NULL)
      OR ptm.user_id IS NOT NULL
    )
);
$$;
REVOKE ALL ON FUNCTION public.can_insert_task(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_insert_task(uuid, uuid, uuid) TO authenticated, service_role;

-- 2. Policy canônica de INSERT em tasks
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND (created_by IS NULL OR created_by = auth.uid())
  AND project_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND public.can_insert_task(project_id, workspace_id, auth.uid())
);

-- 3. Triggers canônicos em public.tasks (BEFORE)
DROP TRIGGER IF EXISTS trg_enforce_task_user_id ON public.tasks;
CREATE TRIGGER trg_enforce_task_user_id
BEFORE INSERT ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_user_id();

DROP TRIGGER IF EXISTS trg_ensure_task_workspace_defaults ON public.tasks;
DROP TRIGGER IF EXISTS trg_00_task_workspace_defaults ON public.tasks;
CREATE TRIGGER trg_ensure_task_workspace_defaults
BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.ensure_task_workspace_defaults();

DROP TRIGGER IF EXISTS trg_assign_task_number ON public.tasks;
CREATE TRIGGER trg_assign_task_number
BEFORE INSERT ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.assign_task_number();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Triggers canônicos em public.tasks (AFTER)
DROP TRIGGER IF EXISTS trg_log_task_changes ON public.tasks;
CREATE TRIGGER trg_log_task_changes
AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.log_task_changes();

DROP TRIGGER IF EXISTS trg_log_task_completion ON public.tasks;
CREATE TRIGGER trg_log_task_completion
AFTER UPDATE ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.log_task_completion();

DROP TRIGGER IF EXISTS trg_new_task_conversation ON public.tasks;
DROP TRIGGER IF EXISTS trg_task_conversation ON public.tasks;
CREATE TRIGGER trg_new_task_conversation
AFTER INSERT ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.handle_new_task_conversation();

DROP TRIGGER IF EXISTS trg_auto_add_task_owner_as_assignee ON public.tasks;
CREATE TRIGGER trg_auto_add_task_owner_as_assignee
AFTER INSERT ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.auto_add_task_owner_as_assignee();

-- 5. Triggers canônicos em public.task_assignees
DROP TRIGGER IF EXISTS trg_validate_task_assignee_status ON public.task_assignees;
CREATE TRIGGER trg_validate_task_assignee_status
BEFORE INSERT OR UPDATE ON public.task_assignees FOR EACH ROW
EXECUTE FUNCTION public.validate_task_assignee_status();

DROP TRIGGER IF EXISTS trg_task_assignee_notification ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_notification
AFTER INSERT ON public.task_assignees FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_notification();

DROP TRIGGER IF EXISTS trg_task_assignee_response ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_response
BEFORE UPDATE ON public.task_assignees FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_response();

DROP TRIGGER IF EXISTS trg_task_assignee_to_conversation ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_to_conversation
AFTER INSERT ON public.task_assignees FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_to_conversation();

DROP TRIGGER IF EXISTS trg_log_task_assignee_change_insert ON public.task_assignees;
CREATE TRIGGER trg_log_task_assignee_change_insert
AFTER INSERT ON public.task_assignees FOR EACH ROW
EXECUTE FUNCTION public.log_task_assignee_change();

DROP TRIGGER IF EXISTS trg_log_task_assignee_change_delete ON public.task_assignees;
CREATE TRIGGER trg_log_task_assignee_change_delete
AFTER DELETE ON public.task_assignees FOR EACH ROW
EXECUTE FUNCTION public.log_task_assignee_change();

NOTIFY pgrst, 'reload schema';
