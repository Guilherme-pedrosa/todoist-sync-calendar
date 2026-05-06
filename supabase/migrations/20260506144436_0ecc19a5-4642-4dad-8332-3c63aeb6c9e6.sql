REVOKE ALL ON FUNCTION public.can_insert_task(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_insert_task(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_insert_task(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_task(uuid, uuid, uuid) TO service_role;