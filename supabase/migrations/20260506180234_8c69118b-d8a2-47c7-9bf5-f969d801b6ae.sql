CREATE OR REPLACE FUNCTION public.create_task_secure(
  p_workspace_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_priority integer DEFAULT 4,
  p_due_date date DEFAULT NULL,
  p_due_time time DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_due_string text DEFAULT NULL,
  p_deadline date DEFAULT NULL,
  p_recurrence_rule text DEFAULT NULL,
  p_google_calendar_event_id text DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_task public.tasks;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Sessão expirada, faça login';
  END IF;

  IF p_project_id IS NULL OR p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Projeto ou workspace inválido';
  END IF;

  IF trim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Título da tarefa é obrigatório';
  END IF;

  IF NOT public.can_insert_task(p_project_id, p_workspace_id, v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar tarefa neste projeto';
  END IF;

  INSERT INTO public.tasks (
    user_id,
    workspace_id,
    created_by,
    title,
    description,
    priority,
    due_date,
    due_time,
    duration_minutes,
    due_string,
    deadline,
    recurrence_rule,
    google_calendar_event_id,
    project_id,
    section_id,
    parent_id
  ) VALUES (
    v_user_id,
    p_workspace_id,
    v_user_id,
    trim(p_title),
    p_description,
    COALESCE(p_priority, 4),
    p_due_date,
    p_due_time,
    p_duration_minutes,
    p_due_string,
    p_deadline,
    p_recurrence_rule,
    p_google_calendar_event_id,
    p_project_id,
    p_section_id,
    p_parent_id
  )
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_task_secure(uuid, uuid, text, text, integer, date, time, integer, text, date, text, text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_task_secure(uuid, uuid, text, text, integer, date, time, integer, text, date, text, text, uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';