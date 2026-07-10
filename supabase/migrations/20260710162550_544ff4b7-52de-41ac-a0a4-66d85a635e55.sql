-- Aceite de atribuição de tarefa passa a ser automático.
-- 1) Novo default = 'accepted' e backfill dos 'pending' existentes.
ALTER TABLE public.task_assignees ALTER COLUMN assignment_status SET DEFAULT 'accepted';
UPDATE public.task_assignees SET assignment_status = 'accepted' WHERE assignment_status = 'pending';

-- 2) Trigger de resposta: NÃO notifica mais 'accepted' (é automático agora).
--    Continua notificando 'returned' e 'declined' (caso venha via API).
CREATE OR REPLACE FUNCTION public.handle_task_assignee_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_title text;
  t_workspace uuid;
  responder_name text;
  notif_type text;
  should_notify boolean := false;
BEGIN
  IF OLD.assignment_status IS NOT DISTINCT FROM NEW.assignment_status THEN
    RETURN NEW;
  END IF;
  -- 'accepted' agora é o default silencioso; não gera notificação.
  IF NEW.assignment_status NOT IN ('declined','returned') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_by IS NULL OR NEW.assigned_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.user_id = NEW.assigned_by
      AND COALESCE(ta.assignment_status, 'accepted') <> 'declined'
  ) INTO should_notify;

  IF NOT COALESCE(should_notify, false) THEN
    NEW.responded_at := now();
    RETURN NEW;
  END IF;

  SELECT t.title, t.workspace_id INTO t_title, t_workspace
  FROM public.tasks t WHERE t.id = NEW.task_id;

  SELECT COALESCE(p.display_name, 'Responsável')
  INTO responder_name
  FROM public.profiles p WHERE p.user_id = NEW.user_id;

  notif_type := CASE NEW.assignment_status
    WHEN 'declined' THEN 'task_assignment_declined'
    WHEN 'returned' THEN 'task_assignment_returned'
  END;

  NEW.responded_at := now();

  INSERT INTO public.notifications (user_id, type, workspace_id, payload)
  VALUES (
    NEW.assigned_by,
    notif_type,
    t_workspace,
    jsonb_build_object(
      'task_id', NEW.task_id,
      'task_title', t_title,
      'responder_user_id', NEW.user_id,
      'responder_name', responder_name,
      'reason', NEW.response_reason
    )
  );

  RETURN NEW;
END;
$$;