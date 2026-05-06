GRANT EXECUTE ON FUNCTION public.can_insert_task(uuid, uuid, uuid) TO public;
GRANT EXECUTE ON FUNCTION public.has_project_access(uuid, uuid) TO public;
GRANT EXECUTE ON FUNCTION public.has_task_access(uuid, uuid) TO public;

NOTIFY pgrst, 'reload schema';