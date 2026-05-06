DROP TRIGGER IF EXISTS trg_assign_task_number ON public.tasks;
DROP TRIGGER IF EXISTS trg_ensure_task_workspace_defaults ON public.tasks;
DROP TRIGGER IF EXISTS trg_log_task_completion ON public.tasks;
DROP TRIGGER IF EXISTS trg_log_task_created ON public.tasks;
DROP TRIGGER IF EXISTS trg_new_task_conversation ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;

DROP TRIGGER IF EXISTS trg_log_task_assignee_change_delete ON public.task_assignees;
DROP TRIGGER IF EXISTS trg_log_task_assignee_change_insert ON public.task_assignees;
DROP TRIGGER IF EXISTS trg_task_assignee_notification ON public.task_assignees;
DROP TRIGGER IF EXISTS trg_task_assignee_response ON public.task_assignees;
DROP TRIGGER IF EXISTS trg_task_assignee_to_conversation ON public.task_assignees;
DROP TRIGGER IF EXISTS trg_validate_task_assignee_status ON public.task_assignees;

DROP TRIGGER IF EXISTS trg_enforce_task_user_id ON public.tasks;
CREATE TRIGGER trg_enforce_task_user_id
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_user_id();

DROP TRIGGER IF EXISTS trg_log_task_changes ON public.tasks;
CREATE TRIGGER trg_log_task_changes
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_changes();

DROP TRIGGER IF EXISTS trg_validate_task_assignee_status ON public.task_assignees;
CREATE TRIGGER trg_validate_task_assignee_status
BEFORE INSERT OR UPDATE ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.validate_task_assignee_status();

DROP TRIGGER IF EXISTS trg_task_assignee_response ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_response
BEFORE UPDATE ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_response();

REVOKE ALL ON FUNCTION public.reschedule_single_occurrence(uuid, date, date, time without time zone, integer, date, time without time zone, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_single_occurrence(uuid, date, date, time without time zone, integer, date, time without time zone, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reschedule_single_occurrence(uuid, date, date, time without time zone, integer, date, time without time zone, text) TO authenticated;