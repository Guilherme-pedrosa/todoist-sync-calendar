-- Remove trigger duplicado de numeração
DROP TRIGGER IF EXISTS trg_assign_task_number ON public.tasks;

-- Atualiza função para renumerar a tarefa quando o workspace mudar
CREATE OR REPLACE FUNCTION public.ensure_task_workspace_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  project_workspace uuid;
  personal_workspace uuid;
  inbox_project uuid;
  next_num integer;
  old_workspace uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_workspace := OLD.workspace_id;
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := NEW.user_id;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT workspace_id INTO project_workspace
    FROM public.projects
    WHERE id = NEW.project_id;

    IF project_workspace IS NOT NULL THEN
      NEW.workspace_id := project_workspace;
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

  -- Se mudou de workspace em UPDATE, renumera a tarefa para evitar conflito de unique constraint
  IF TG_OP = 'UPDATE' AND old_workspace IS DISTINCT FROM NEW.workspace_id THEN
    PERFORM 1 FROM public.workspaces WHERE id = NEW.workspace_id FOR UPDATE;
    SELECT COALESCE(MAX(task_number), 0) + 1
      INTO next_num
      FROM public.tasks
      WHERE workspace_id = NEW.workspace_id;
    NEW.task_number := next_num;
  END IF;

  RETURN NEW;
END;
$function$;