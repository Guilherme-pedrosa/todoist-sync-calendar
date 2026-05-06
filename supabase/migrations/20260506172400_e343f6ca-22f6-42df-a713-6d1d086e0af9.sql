CREATE OR REPLACE FUNCTION public.auto_add_task_owner_as_assignee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.task_assignees (task_id, user_id, assigned_by, assignment_status)
  VALUES (NEW.id, NEW.user_id, COALESCE(NEW.created_by, NEW.user_id), 'accepted')
  ON CONFLICT (task_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_task_owner_as_assignee ON public.tasks;
CREATE TRIGGER trg_auto_add_task_owner_as_assignee
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.auto_add_task_owner_as_assignee();

INSERT INTO public.task_assignees (task_id, user_id, assigned_by, assignment_status)
SELECT t.id, t.user_id, COALESCE(t.created_by, t.user_id), 'accepted'
FROM public.tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM public.task_assignees ta
  WHERE ta.task_id = t.id AND ta.user_id = t.user_id
)
ON CONFLICT (task_id, user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';