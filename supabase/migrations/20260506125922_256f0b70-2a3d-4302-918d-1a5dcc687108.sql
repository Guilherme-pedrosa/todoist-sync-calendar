CREATE OR REPLACE FUNCTION public.enforce_task_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'auth.uid() is NULL — sessão inválida';
  END IF;

  NEW.user_id := auth.uid();

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_task_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_task_user_id() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_task_user_id() FROM authenticated;