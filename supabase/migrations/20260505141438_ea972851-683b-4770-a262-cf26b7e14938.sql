
ALTER TABLE public.task_assignees
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS response_reason text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- Validate status values via trigger (to avoid CHECK immutability concerns)
CREATE OR REPLACE FUNCTION public.validate_task_assignee_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assignment_status NOT IN ('pending','accepted','declined','returned') THEN
    RAISE EXCEPTION 'Invalid assignment_status: %', NEW.assignment_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_task_assignee_status ON public.task_assignees;
CREATE TRIGGER trg_validate_task_assignee_status
BEFORE INSERT OR UPDATE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.validate_task_assignee_status();

-- Notify the assigner when the assignee responds
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
BEGIN
  IF OLD.assignment_status IS NOT DISTINCT FROM NEW.assignment_status THEN
    RETURN NEW;
  END IF;
  IF NEW.assignment_status NOT IN ('accepted','declined','returned') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_by IS NULL OR NEW.assigned_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT t.title, t.workspace_id INTO t_title, t_workspace
  FROM public.tasks t WHERE t.id = NEW.task_id;

  SELECT COALESCE(p.display_name, 'Responsável')
  INTO responder_name
  FROM public.profiles p WHERE p.user_id = NEW.user_id;

  notif_type := CASE NEW.assignment_status
    WHEN 'accepted' THEN 'task_assignment_accepted'
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

DROP TRIGGER IF EXISTS trg_task_assignee_response ON public.task_assignees;
CREATE TRIGGER trg_task_assignee_response
BEFORE UPDATE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignee_response();
