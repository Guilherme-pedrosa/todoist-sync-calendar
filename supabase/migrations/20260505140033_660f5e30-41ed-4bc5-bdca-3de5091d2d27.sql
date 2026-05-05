ALTER TABLE public.meeting_invitations
  DROP CONSTRAINT IF EXISTS meeting_invitations_status_check;

ALTER TABLE public.meeting_invitations
  ADD CONSTRAINT meeting_invitations_status_check
  CHECK (status IN ('pending','accepted','declined','proposed'));

ALTER TABLE public.meeting_invitations
  ADD COLUMN IF NOT EXISTS proposed_date date,
  ADD COLUMN IF NOT EXISTS proposed_time time,
  ADD COLUMN IF NOT EXISTS proposed_message text;

-- Atualiza trigger de resposta para também notificar "proposed"
CREATE OR REPLACE FUNCTION public.handle_meeting_invitation_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_title text;
  t_workspace uuid;
  inv_name text;
  notif_type text;
BEGIN
  IF OLD.status = NEW.status
     AND COALESCE(OLD.proposed_date::text,'') = COALESCE(NEW.proposed_date::text,'')
     AND COALESCE(OLD.proposed_time::text,'') = COALESCE(NEW.proposed_time::text,'') THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('accepted','declined','proposed') THEN
    RETURN NEW;
  END IF;

  SELECT t.title, t.workspace_id INTO t_title, t_workspace
  FROM public.tasks t WHERE t.id = NEW.task_id;

  SELECT COALESCE(p.display_name, NEW.invitee_name, NEW.invitee_email)
  INTO inv_name
  FROM public.profiles p
  WHERE p.user_id = NEW.invitee_user_id;

  notif_type := CASE
    WHEN NEW.status = 'accepted' THEN 'meeting_accepted'
    WHEN NEW.status = 'declined' THEN 'meeting_declined'
    ELSE 'meeting_proposed'
  END;

  INSERT INTO public.notifications (user_id, type, workspace_id, payload)
  VALUES (
    NEW.invited_by,
    notif_type,
    t_workspace,
    jsonb_build_object(
      'task_id', NEW.task_id,
      'invitation_id', NEW.id,
      'task_title', t_title,
      'invitee_name', COALESCE(inv_name, 'Convidado'),
      'invitee_user_id', NEW.invitee_user_id,
      'proposed_date', NEW.proposed_date,
      'proposed_time', NEW.proposed_time,
      'proposed_message', NEW.proposed_message
    )
  );

  NEW.responded_at := now();
  RETURN NEW;
END;
$$;