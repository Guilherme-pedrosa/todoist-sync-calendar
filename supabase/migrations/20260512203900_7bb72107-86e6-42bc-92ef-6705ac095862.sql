CREATE OR REPLACE FUNCTION public.enforce_task_chat_notification_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_task_id uuid;
  v_conversation_id uuid;
  v_payload_task text;
  v_payload_conversation text;
  v_allowed boolean := false;
BEGIN
  IF NEW.type NOT IN ('chat_message', 'chat_mention') THEN
    RETURN NEW;
  END IF;

  -- Menções explícitas (@) são permitidas mesmo quando a pessoa não está delegada.
  IF NEW.type = 'chat_mention' THEN
    RETURN NEW;
  END IF;

  v_payload_task := NEW.payload->>'task_id';
  IF v_payload_task ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_task_id := v_payload_task::uuid;
  END IF;

  IF v_task_id IS NULL THEN
    v_payload_conversation := NEW.payload->>'conversation_id';
    IF v_payload_conversation ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_conversation_id := v_payload_conversation::uuid;
      SELECT c.task_id INTO v_task_id
      FROM public.conversations c
      WHERE c.id = v_conversation_id
        AND c.type = 'task';
    END IF;
  END IF;

  IF v_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Apenas pessoas vinculadas em task_assignees (responsável ou informado, não recusado)
  -- recebem notificação. Criador/owner não recebe automaticamente.
  SELECT EXISTS (
    SELECT 1
    FROM public.task_assignees ta
    WHERE ta.task_id = v_task_id
      AND ta.user_id = NEW.user_id
      AND COALESCE(ta.assignment_status, 'pending') <> 'declined'
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;