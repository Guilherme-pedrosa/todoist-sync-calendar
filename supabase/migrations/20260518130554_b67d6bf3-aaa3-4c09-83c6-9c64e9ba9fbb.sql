CREATE OR REPLACE FUNCTION public.create_task_secure(p_workspace_id uuid, p_project_id uuid, p_title text, p_description text DEFAULT NULL::text, p_priority integer DEFAULT 4, p_due_date date DEFAULT NULL::date, p_due_time time without time zone DEFAULT NULL::time without time zone, p_duration_minutes integer DEFAULT NULL::integer, p_due_string text DEFAULT NULL::text, p_deadline date DEFAULT NULL::date, p_recurrence_rule text DEFAULT NULL::text, p_google_calendar_event_id text DEFAULT NULL::text, p_section_id uuid DEFAULT NULL::uuid, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS tasks
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

  BEGIN
    INSERT INTO public.tasks (
      user_id, workspace_id, created_by, title, description, priority,
      due_date, due_time, duration_minutes, due_string, deadline,
      recurrence_rule, google_calendar_event_id, project_id, section_id, parent_id
    ) VALUES (
      v_user_id, p_workspace_id, v_user_id, trim(p_title), p_description, COALESCE(p_priority, 4),
      p_due_date, p_due_time, p_duration_minutes, p_due_string, p_deadline,
      p_recurrence_rule, p_google_calendar_event_id, p_project_id, p_section_id, p_parent_id
    )
    RETURNING * INTO v_task;
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE '%idx_tasks_unique_active_title_day_time%' THEN
      RAISE EXCEPTION 'Já existe uma tarefa ativa com este mesmo título, data e horário. Conclua ou renomeie a tarefa existente antes de criar outra.';
    ELSE
      RAISE;
    END IF;
  END;

  RETURN v_task;
END;
$function$;