-- Add role column to task_assignees: 'responsible' (default) or 'informed' (CC).
-- Informed users get notifications + chat access but tasks don't appear in their agenda.

ALTER TABLE public.task_assignees
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'responsible';

ALTER TABLE public.task_assignees
  DROP CONSTRAINT IF EXISTS task_assignees_role_check;
ALTER TABLE public.task_assignees
  ADD CONSTRAINT task_assignees_role_check
  CHECK (role IN ('responsible','informed'));

CREATE INDEX IF NOT EXISTS idx_task_assignees_role
  ON public.task_assignees(task_id, role);

-- Update assignee notification trigger to include role in payload
CREATE OR REPLACE FUNCTION public.handle_task_assignee_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t_title text;
  t_workspace uuid;
BEGIN
  IF NEW.assigned_by IS NOT NULL AND NEW.assigned_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT t.title, t.workspace_id INTO t_title, t_workspace
  FROM public.tasks t
  WHERE t.id = NEW.task_id;

  IF t_workspace IS NULL THEN
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
      'assigned_by', NEW.assigned_by,
      'role', NEW.role
    )
  );

  RETURN NEW;
END;
$function$;

-- Update completion notification trigger to also notify "informed" users
CREATE OR REPLACE FUNCTION public.handle_task_completion_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
  v_actor_name text;
  v_actor_email text;
  v_recipient uuid;
BEGIN
  IF NEW.completed IS NOT TRUE OR OLD.completed IS TRUE THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(auth.uid(), NEW.user_id);

  SELECT display_name, email INTO v_actor_name, v_actor_email
  FROM public.profiles WHERE user_id = v_actor LIMIT 1;

  -- Notify creator (if not the actor)
  IF v_actor <> NEW.user_id THEN
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
  END IF;

  -- Notify all "informed" assignees (except actor and creator who was already notified)
  FOR v_recipient IN
    SELECT user_id FROM public.task_assignees
    WHERE task_id = NEW.id
      AND role = 'informed'
      AND user_id <> v_actor
      AND user_id <> NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, workspace_id, type, payload)
    VALUES (
      v_recipient,
      NEW.workspace_id,
      'task_completed',
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title,
        'completed_by', v_actor,
        'completed_by_name', COALESCE(v_actor_name, split_part(v_actor_email, '@', 1), 'Usuário'),
        'role', 'informed'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- New trigger: notify informed users when key task fields change
CREATE OR REPLACE FUNCTION public.handle_task_update_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
  v_actor_name text;
  v_actor_email text;
  v_recipient uuid;
  v_changed_field text;
BEGIN
  -- Skip if nothing relevant changed
  IF OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.description IS NOT DISTINCT FROM NEW.description
     AND OLD.due_date IS NOT DISTINCT FROM NEW.due_date
     AND OLD.due_time IS NOT DISTINCT FROM NEW.due_time
     AND OLD.priority IS NOT DISTINCT FROM NEW.priority
     AND OLD.project_id IS NOT DISTINCT FROM NEW.project_id THEN
    RETURN NEW;
  END IF;

  -- Skip completion changes (handled by completion trigger)
  IF (OLD.completed IS DISTINCT FROM NEW.completed) THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(auth.uid(), NEW.user_id);

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    v_changed_field := 'título';
  ELSIF OLD.due_date IS DISTINCT FROM NEW.due_date OR OLD.due_time IS DISTINCT FROM NEW.due_time THEN
    v_changed_field := 'data/hora';
  ELSIF OLD.priority IS DISTINCT FROM NEW.priority THEN
    v_changed_field := 'prioridade';
  ELSIF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    v_changed_field := 'projeto';
  ELSE
    v_changed_field := 'descrição';
  END IF;

  SELECT display_name, email INTO v_actor_name, v_actor_email
  FROM public.profiles WHERE user_id = v_actor LIMIT 1;

  FOR v_recipient IN
    SELECT user_id FROM public.task_assignees
    WHERE task_id = NEW.id
      AND role = 'informed'
      AND user_id <> v_actor
  LOOP
    INSERT INTO public.notifications (user_id, workspace_id, type, payload)
    VALUES (
      v_recipient,
      NEW.workspace_id,
      'task_updated',
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title,
        'updated_by', v_actor,
        'updated_by_name', COALESCE(v_actor_name, split_part(v_actor_email, '@', 1), 'Usuário'),
        'changed_field', v_changed_field
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_task_update_notification ON public.tasks;
CREATE TRIGGER trg_task_update_notification
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_task_update_notification();