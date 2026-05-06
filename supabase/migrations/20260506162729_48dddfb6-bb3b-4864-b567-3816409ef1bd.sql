-- Restore triggers on public.tasks
DROP TRIGGER IF EXISTS trg_ensure_task_workspace_defaults ON public.tasks;
CREATE TRIGGER trg_ensure_task_workspace_defaults
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.ensure_task_workspace_defaults();

DROP TRIGGER IF EXISTS trg_assign_task_number ON public.tasks;
CREATE TRIGGER trg_assign_task_number
BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.assign_task_number();

DROP TRIGGER IF EXISTS trg_enforce_task_user_id ON public.tasks;
CREATE TRIGGER trg_enforce_task_user_id
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_task_user_id();

DROP TRIGGER IF EXISTS trg_log_task_changes ON public.tasks;
CREATE TRIGGER trg_log_task_changes
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_changes();

DROP TRIGGER IF EXISTS trg_log_task_completion ON public.tasks;
CREATE TRIGGER trg_log_task_completion
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_completion();

DROP TRIGGER IF EXISTS trg_new_task_conversation ON public.tasks;
CREATE TRIGGER trg_new_task_conversation
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_new_task_conversation();

-- Restore triggers on public.task_assignees
DROP TRIGGER IF EXISTS trg_validate_task_assignee_status ON public.task_assignees;
CREATE TRIGGER trg_validate_task_assignee_status
BEFORE INSERT OR UPDATE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.validate_task_assignee_status();

DROP TRIGGER IF EXISTS trg_log_task_assignee_change ON public.task_assignees;
CREATE TRIGGER trg_log_task_assignee_change
AFTER INSERT OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.log_task_assignee_change();

DROP TRIGGER IF EXISTS trg_task_assignee_response ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_response
AFTER UPDATE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignee_response();

DROP TRIGGER IF EXISTS trg_task_assignee_to_conversation ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_to_conversation
AFTER INSERT ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignee_to_conversation();

NOTIFY pgrst, 'reload schema';