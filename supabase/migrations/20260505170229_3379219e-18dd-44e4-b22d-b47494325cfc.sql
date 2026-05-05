CREATE OR REPLACE FUNCTION public._debug_filipe_tasks()
RETURNS SETOF tasks
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT t.* FROM tasks t
  WHERE t.id='dbe97144-63fe-4217-8966-45f966f77615'
    AND public.has_task_access(t.id, '282e1b6d-259b-44f9-b79c-c7641cb603f2'::uuid);
$$;
SELECT public._debug_filipe_tasks();