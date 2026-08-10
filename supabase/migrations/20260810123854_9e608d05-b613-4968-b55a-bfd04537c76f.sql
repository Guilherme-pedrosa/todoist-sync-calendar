
CREATE OR REPLACE FUNCTION public.notify_users(
  p_user_ids uuid[],
  p_type text,
  p_workspace_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_type NOT IN ('chat_message', 'chat_mention', 'task_comment_mention') THEN
    RAISE EXCEPTION 'notification type not allowed: %', p_type;
  END IF;

  -- Caller must belong to the workspace they are notifying into.
  IF p_workspace_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = p_workspace_id AND wm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'caller is not a member of the workspace';
  END IF;

  INSERT INTO public.notifications (user_id, type, workspace_id, payload)
  SELECT t.uid,
         p_type,
         p_workspace_id,
         COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('from_user', v_caller::text)
    FROM unnest(p_user_ids) AS t(uid)
   WHERE t.uid IS NOT NULL
     AND t.uid <> v_caller
     AND (
       p_workspace_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.workspace_members wm2
          WHERE wm2.workspace_id = p_workspace_id AND wm2.user_id = t.uid
       )
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_users(uuid[], text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_users(uuid[], text, uuid, jsonb) TO authenticated;

DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
