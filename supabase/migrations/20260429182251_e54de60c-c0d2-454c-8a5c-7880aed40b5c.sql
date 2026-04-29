
-- Realtime para notifications e task_assignees
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.task_assignees REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_assignees'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees';
  END IF;
END$$;

-- Trigger: notifica usuário quando vira responsável por uma tarefa
CREATE OR REPLACE FUNCTION public.handle_task_assignee_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t_title TEXT;
  t_workspace UUID;
  ws_personal BOOLEAN;
BEGIN
  -- não notificar a si mesmo
  IF NEW.assigned_by IS NOT NULL AND NEW.assigned_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT t.title, t.workspace_id INTO t_title, t_workspace
  FROM public.tasks t WHERE t.id = NEW.task_id;

  -- pular workspaces pessoais
  SELECT is_personal INTO ws_personal FROM public.workspaces WHERE id = t_workspace;
  IF COALESCE(ws_personal, true) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, workspace_id, payload)
  VALUES (
    NEW.user_id,
    'task_assigned',
    t_workspace,
    jsonb_build_object(
      'task_id', NEW.task_id,
      'task_title', t_title,
      'assigned_by', NEW.assigned_by
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignee_notification ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_notification
AFTER INSERT ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_notification();

-- A política atual de notif_insert exige auth.uid() = user_id, o que bloqueia
-- inserts feitos via SECURITY DEFINER (auth.uid() é o autor da ação, não o destinatário).
-- Precisamos permitir que triggers SECURITY DEFINER insiram notificações para qualquer usuário.
DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id  -- usuário criando notificação para si (ex.: chat_mention enviado a si próprio)
    OR auth.uid() IS NOT NULL  -- qualquer usuário autenticado pode notificar outros (mention/assignment)
  );
