CREATE OR REPLACE FUNCTION public.reschedule_single_occurrence(
  p_task_id uuid,
  p_occurrence_date date,
  p_new_date date,
  p_new_time time without time zone,
  p_new_duration integer,
  p_series_due_date date,
  p_series_due_time time without time zone,
  p_series_recurrence_rule text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_source public.tasks%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada, faça login';
  END IF;

  SELECT * INTO v_source
  FROM public.tasks
  WHERE id = p_task_id
    AND public.has_task_access(id, v_actor)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada ou sem acesso';
  END IF;

  IF v_source.recurrence_rule IS NULL THEN
    RAISE EXCEPTION 'Tarefa não é recorrente';
  END IF;

  IF p_series_due_date IS NULL OR p_series_recurrence_rule IS NULL THEN
    RAISE EXCEPTION 'Dados inválidos para remanejar a série recorrente';
  END IF;

  INSERT INTO public.tasks (
    user_id,
    created_by,
    workspace_id,
    project_id,
    section_id,
    parent_id,
    title,
    description,
    priority,
    due_date,
    due_time,
    duration_minutes,
    due_string,
    deadline
  ) VALUES (
    v_source.user_id,
    v_actor,
    v_source.workspace_id,
    v_source.project_id,
    v_source.section_id,
    v_source.parent_id,
    v_source.title,
    v_source.description,
    v_source.priority,
    p_new_date,
    p_new_time,
    p_new_duration,
    v_source.due_string,
    v_source.deadline
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.task_labels (task_id, label_id)
  SELECT v_new_id, label_id
  FROM public.task_labels
  WHERE task_id = p_task_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.task_assignees (task_id, user_id, assigned_by, assignment_status)
  SELECT v_new_id, user_id, v_actor, assignment_status
  FROM public.task_assignees
  WHERE task_id = p_task_id
  ON CONFLICT (task_id, user_id) DO NOTHING;

  UPDATE public.tasks
  SET due_date = p_series_due_date,
      due_time = p_series_due_time,
      recurrence_rule = p_series_recurrence_rule
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível atualizar a série recorrente';
  END IF;

  RETURN v_new_id;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_task_user_id ON public.tasks;
CREATE TRIGGER trg_enforce_task_user_id
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_user_id();

DROP TRIGGER IF EXISTS trg_ensure_task_workspace_defaults ON public.tasks;
CREATE TRIGGER trg_ensure_task_workspace_defaults
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.ensure_task_workspace_defaults();

DROP TRIGGER IF EXISTS trg_assign_task_number ON public.tasks;
CREATE TRIGGER trg_assign_task_number
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.assign_task_number();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_log_task_created ON public.tasks;
CREATE TRIGGER trg_log_task_created
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_created();

DROP TRIGGER IF EXISTS trg_log_task_changes ON public.tasks;
CREATE TRIGGER trg_log_task_changes
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_changes();

DROP TRIGGER IF EXISTS trg_log_task_completion ON public.tasks;
CREATE TRIGGER trg_log_task_completion
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_completion();

DROP TRIGGER IF EXISTS trg_new_task_conversation ON public.tasks;
CREATE TRIGGER trg_new_task_conversation
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_task_conversation();

DROP TRIGGER IF EXISTS trg_validate_task_assignee_status ON public.task_assignees;
CREATE TRIGGER trg_validate_task_assignee_status
BEFORE INSERT OR UPDATE ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.validate_task_assignee_status();

DROP TRIGGER IF EXISTS trg_task_assignee_notification ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_notification
AFTER INSERT ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_notification();

DROP TRIGGER IF EXISTS trg_task_assignee_response ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_response
BEFORE UPDATE ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_response();

DROP TRIGGER IF EXISTS trg_task_assignee_to_conversation ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_to_conversation
AFTER INSERT ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_to_conversation();

DROP TRIGGER IF EXISTS trg_log_task_assignee_change_insert ON public.task_assignees;
CREATE TRIGGER trg_log_task_assignee_change_insert
AFTER INSERT ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.log_task_assignee_change();

DROP TRIGGER IF EXISTS trg_log_task_assignee_change_delete ON public.task_assignees;
CREATE TRIGGER trg_log_task_assignee_change_delete
AFTER DELETE ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.log_task_assignee_change();