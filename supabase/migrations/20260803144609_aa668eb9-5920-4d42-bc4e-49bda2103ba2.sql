-- 1) Reatribuir tarefas em aberto da FROTA WEDO para o Filipe
INSERT INTO public.task_assignees (task_id, user_id, role, assignment_status, assigned_by)
SELECT t.id, '282e1b6d-259b-44f9-b79c-c7641cb603f2'::uuid, 'responsible', 'accepted', t.created_by
FROM public.tasks t
WHERE t.project_id = '72e77628-8e19-4937-8a4c-e570727905b3'
  AND t.completed = false
  AND t.deleted_at IS NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

DELETE FROM public.task_assignees a
USING public.tasks t
WHERE a.task_id = t.id
  AND t.project_id = '72e77628-8e19-4937-8a4c-e570727905b3'
  AND t.completed = false
  AND t.deleted_at IS NULL
  AND a.role = 'responsible'
  AND a.user_id = '38f31819-f6e5-45db-b666-bb7d10b67bfb';

UPDATE public.tasks
SET user_id = '282e1b6d-259b-44f9-b79c-c7641cb603f2'
WHERE project_id = '72e77628-8e19-4937-8a4c-e570727905b3'
  AND completed = false
  AND deleted_at IS NULL;

-- 2) Novas tarefas do projeto nascem com Filipe como responsável
CREATE OR REPLACE FUNCTION public.default_frota_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id = '72e77628-8e19-4937-8a4c-e570727905b3'
     AND NOT EXISTS (
       SELECT 1 FROM public.task_assignees
       WHERE task_id = NEW.id AND role = 'responsible'
     ) THEN
    INSERT INTO public.task_assignees (task_id, user_id, role, assignment_status, assigned_by)
    VALUES (NEW.id, '282e1b6d-259b-44f9-b79c-c7641cb603f2', 'responsible', 'accepted', NEW.created_by)
    ON CONFLICT (task_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_frota_assignee ON public.tasks;
CREATE TRIGGER trg_default_frota_assignee
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.default_frota_assignee();