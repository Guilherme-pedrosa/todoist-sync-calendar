-- Função que dispara push via edge function quando uma notification é criada
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  push_title text;
  push_body text;
  push_url text;
  task_title text;
BEGIN
  -- Monta o payload baseado no tipo
  IF NEW.type = 'task_assigned' THEN
    task_title := COALESCE(NEW.payload->>'task_title', 'Nova tarefa');
    push_title := '📌 Nova tarefa atribuída';
    push_body := task_title;
    push_url := '/today';
  ELSE
    push_title := 'TaskFlow';
    push_body := COALESCE(NEW.payload->>'message', 'Você tem uma nova notificação');
    push_url := '/today';
  END IF;

  PERFORM net.http_post(
    url := 'https://scgcbifmcvazmalqqpju.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', 'PUSH_TRIGGER_SHARED_SECRET_PLACEHOLDER'
    ),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(NEW.user_id),
      'title', push_title,
      'body', push_body,
      'url', push_url,
      'tag', 'notif-' || NEW.id::text
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_push_on_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_push_on_notification
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_push_on_notification();