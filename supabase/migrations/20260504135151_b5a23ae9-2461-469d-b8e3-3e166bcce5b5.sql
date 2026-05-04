-- 1) Corrige tarefas com workspace_id que não bate com o do projeto
UPDATE public.tasks t
SET workspace_id = p.workspace_id
FROM public.projects p
WHERE t.project_id = p.id
  AND t.workspace_id IS DISTINCT FROM p.workspace_id;

-- 2) Reforça o trigger ensure_task_workspace_defaults para SEMPRE sincronizar com o projeto
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
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := NEW.user_id;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT workspace_id INTO project_workspace
    FROM public.projects
    WHERE id = NEW.project_id;

    IF project_workspace IS NOT NULL THEN
      -- IMPORTANTE: força o workspace da tarefa a coincidir com o do projeto
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

  RETURN NEW;
END;
$function$;