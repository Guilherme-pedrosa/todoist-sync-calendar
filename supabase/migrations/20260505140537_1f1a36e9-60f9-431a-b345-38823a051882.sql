-- Trigger: log de criação
CREATE OR REPLACE FUNCTION public.log_task_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.task_activity_log (task_id, user_id, action, payload)
  VALUES (
    NEW.id,
    COALESCE(NEW.created_by, NEW.user_id),
    'created',
    jsonb_build_object(
      'title', NEW.title,
      'project_id', NEW.project_id,
      'priority', NEW.priority,
      'due_date', NEW.due_date,
      'due_time', NEW.due_time
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_created ON public.tasks;
CREATE TRIGGER trg_log_task_created
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_created();

-- Trigger: log de alterações relevantes
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  changes jsonb := '{}'::jsonb;
BEGIN
  IF actor IS NULL THEN
    actor := NEW.user_id;
  END IF;

  IF COALESCE(OLD.title,'') IS DISTINCT FROM COALESCE(NEW.title,'') THEN
    changes := changes || jsonb_build_object('title', jsonb_build_object('from', OLD.title, 'to', NEW.title));
  END IF;
  IF COALESCE(OLD.description,'') IS DISTINCT FROM COALESCE(NEW.description,'') THEN
    changes := changes || jsonb_build_object('description', jsonb_build_object('from', OLD.description, 'to', NEW.description));
  END IF;
  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    changes := changes || jsonb_build_object('due_date', jsonb_build_object('from', OLD.due_date, 'to', NEW.due_date));
  END IF;
  IF OLD.due_time IS DISTINCT FROM NEW.due_time THEN
    changes := changes || jsonb_build_object('due_time', jsonb_build_object('from', OLD.due_time, 'to', NEW.due_time));
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    changes := changes || jsonb_build_object('priority', jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
  END IF;
  IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    changes := changes || jsonb_build_object('project_id', jsonb_build_object('from', OLD.project_id, 'to', NEW.project_id));
  END IF;
  IF OLD.section_id IS DISTINCT FROM NEW.section_id THEN
    changes := changes || jsonb_build_object('section_id', jsonb_build_object('from', OLD.section_id, 'to', NEW.section_id));
  END IF;
  IF OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes THEN
    changes := changes || jsonb_build_object('duration_minutes', jsonb_build_object('from', OLD.duration_minutes, 'to', NEW.duration_minutes));
  END IF;

  -- conclusão / reabertura → registradas separadamente
  IF (OLD.completed_at IS NULL) <> (NEW.completed_at IS NULL) THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, payload)
    VALUES (
      NEW.id,
      actor,
      CASE WHEN NEW.completed_at IS NOT NULL THEN 'completed' ELSE 'reopened' END,
      jsonb_build_object('title', NEW.title)
    );
  END IF;

  IF changes <> '{}'::jsonb THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, payload)
    VALUES (NEW.id, actor, 'updated', jsonb_build_object('changes', changes));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_changes ON public.tasks;
CREATE TRIGGER trg_log_task_changes
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_changes();

-- Trigger: log de atribuição/remoção de responsáveis
CREATE OR REPLACE FUNCTION public.log_task_assignee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, payload)
    VALUES (NEW.task_id, COALESCE(NEW.assigned_by, actor), 'assignee_added',
      jsonb_build_object('assignee_id', NEW.user_id));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, payload)
    VALUES (OLD.task_id, actor, 'assignee_removed',
      jsonb_build_object('assignee_id', OLD.user_id));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_assignee ON public.task_assignees;
CREATE TRIGGER trg_log_task_assignee
AFTER INSERT OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.log_task_assignee_change();