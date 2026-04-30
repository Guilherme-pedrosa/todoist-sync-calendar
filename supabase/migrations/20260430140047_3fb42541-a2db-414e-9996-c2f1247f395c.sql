CREATE OR REPLACE FUNCTION public.ensure_task_workspace_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  project_workspace uuid;
  personal_workspace uuid;
  inbox_project uuid;
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := NEW.user_id;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT workspace_id INTO project_workspace
    FROM public.projects
    WHERE id = NEW.project_id;

    IF project_workspace IS NOT NULL THEN
      NEW.workspace_id := COALESCE(NEW.workspace_id, project_workspace);
    END IF;
  END IF;

  IF NEW.project_id IS NULL THEN
    SELECT id INTO personal_workspace
    FROM public.workspaces
    WHERE owner_id = NEW.user_id AND is_personal = true
    LIMIT 1;

    IF personal_workspace IS NULL THEN
      INSERT INTO public.workspaces (name, slug, owner_id, is_personal)
      VALUES ('Pessoal', 'pessoal-' || NEW.user_id::text, NEW.user_id, true)
      ON CONFLICT (slug) DO NOTHING
      RETURNING id INTO personal_workspace;

      IF personal_workspace IS NULL THEN
        SELECT id INTO personal_workspace
        FROM public.workspaces
        WHERE owner_id = NEW.user_id AND is_personal = true
        LIMIT 1;
      END IF;

      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (personal_workspace, NEW.user_id, 'owner')
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT id INTO inbox_project
    FROM public.projects
    WHERE user_id = NEW.user_id AND workspace_id = personal_workspace AND is_inbox = true
    LIMIT 1;

    IF inbox_project IS NULL THEN
      INSERT INTO public.projects (user_id, workspace_id, owner_id, name, color, is_inbox, position, visibility)
      VALUES (NEW.user_id, personal_workspace, NEW.user_id, 'Caixa de Entrada', 'hsl(230, 10%, 50%)', true, 0, 'private')
      RETURNING id INTO inbox_project;
    END IF;

    NEW.project_id := inbox_project;
    NEW.workspace_id := personal_workspace;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o workspace da tarefa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_00_task_workspace_defaults ON public.tasks;
CREATE TRIGGER trg_00_task_workspace_defaults
BEFORE INSERT OR UPDATE OF project_id ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.ensure_task_workspace_defaults();

DROP TRIGGER IF EXISTS trg_10_assign_task_number ON public.tasks;
CREATE TRIGGER trg_10_assign_task_number
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.assign_task_number();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_task_assignee_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

DROP TRIGGER IF EXISTS trg_assignee_conversation ON public.task_assignees;
CREATE TRIGGER trg_assignee_conversation
AFTER INSERT ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_assignee_to_conversation();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;