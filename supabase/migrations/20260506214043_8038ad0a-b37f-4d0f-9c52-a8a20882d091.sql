CREATE OR REPLACE FUNCTION public.handle_task_completion_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_actor_name text;
  v_actor_email text;
BEGIN
  -- Só dispara em transição false -> true
  IF NEW.completed IS NOT TRUE OR OLD.completed IS TRUE THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(auth.uid(), NEW.user_id);

  -- Se foi o próprio criador que concluiu, não notifica
  IF v_actor = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name, email INTO v_actor_name, v_actor_email
  FROM public.profiles WHERE user_id = v_actor LIMIT 1;

  INSERT INTO public.notifications (user_id, workspace_id, type, payload)
  VALUES (
    NEW.user_id,
    NEW.workspace_id,
    'task_completed',
    jsonb_build_object(
      'task_id', NEW.id,
      'task_title', NEW.title,
      'completed_by', v_actor,
      'completed_by_name', COALESCE(v_actor_name, split_part(v_actor_email, '@', 1), 'Usuário')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_completion_notification ON public.tasks;
CREATE TRIGGER trg_task_completion_notification
AFTER UPDATE ON public.tasks FOR EACH ROW
EXECUTE FUNCTION public.handle_task_completion_notification();