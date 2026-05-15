CREATE OR REPLACE FUNCTION public.reschedule_single_occurrence(
  p_task_id uuid,
  p_occurrence_date date,
  p_new_date date,
  p_new_time time without time zone,
  p_new_duration integer,
  p_series_due_date date,
  p_series_due_time time without time zone,
  p_series_recurrence_rule text
) RETURNS uuid
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

  -- IMPORTANT: avança a série PRIMEIRO para liberar o slot (user_id, title, date, time)
  -- caso a nova tarefa avulsa caia exatamente sobre a data/hora original da série.
  UPDATE public.tasks
  SET due_date = p_series_due_date,
      due_time = p_series_due_time,
      recurrence_rule = p_series_recurrence_rule
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível atualizar a série recorrente';
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

  RETURN v_new_id;
END;
$function$;