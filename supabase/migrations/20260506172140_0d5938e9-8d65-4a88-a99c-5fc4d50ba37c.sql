CREATE OR REPLACE FUNCTION public.debug_try_insert_task(_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  new_id uuid;
  err_msg text;
  err_state text;
BEGIN
  BEGIN
    INSERT INTO public.tasks (user_id, project_id, title, priority)
    VALUES (auth.uid(), _project_id, 'DEBUG_INSERT', 4)
    RETURNING id INTO new_id;
    RETURN jsonb_build_object('ok', true, 'id', new_id, 'uid', auth.uid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_state = RETURNED_SQLSTATE;
    RETURN jsonb_build_object('ok', false, 'sqlstate', err_state, 'message', err_msg, 'uid', auth.uid());
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.debug_try_insert_task(uuid) TO public, anon, authenticated;