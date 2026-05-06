CREATE OR REPLACE FUNCTION public.enforce_task_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is NULL — sessão inválida';
  END IF;

  NEW.user_id := auth.uid();

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_user_id ON public.tasks;
CREATE TRIGGER trg_enforce_task_user_id
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_user_id();

CREATE OR REPLACE FUNCTION public.reschedule_single_occurrence(
  p_task_id UUID,
  p_occurrence_date DATE,
  p_new_date DATE,
  p_new_time TIME,
  p_new_duration INT,
  p_series_due_date DATE,
  p_series_due_time TIME,
  p_series_recurrence_rule TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source public.tasks%ROWTYPE;
  v_new_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada, faça login';
  END IF;

  SELECT * INTO v_source
  FROM public.tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada ou sem acesso';
  END IF;

  IF v_source.recurrence_rule IS NULL THEN
    RAISE EXCEPTION 'Tarefa não é recorrente';
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
    auth.uid(),
    auth.uid(),
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
  WHERE task_id = p_task_id;

  INSERT INTO public.task_assignees (task_id, user_id, assigned_by)
  SELECT v_new_id, user_id, auth.uid()
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
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_single_occurrence(UUID, DATE, DATE, TIME, INT, DATE, TIME, TEXT) TO authenticated;