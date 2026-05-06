REVOKE ALL ON FUNCTION public.enforce_task_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_task_user_id() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_task_user_id() FROM authenticated;