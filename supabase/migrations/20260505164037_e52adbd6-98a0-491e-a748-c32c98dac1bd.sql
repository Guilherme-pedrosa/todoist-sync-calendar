CREATE OR REPLACE FUNCTION public.has_task_access(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        public.has_project_access(t.project_id, _user_id)
        OR EXISTS (
          SELECT 1
          FROM public.task_assignees ta
          WHERE ta.task_id = t.id
            AND ta.user_id = _user_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.meeting_invitations mi
          WHERE mi.task_id = t.id
            AND mi.invitee_user_id = _user_id
            AND mi.status <> 'declined'
        )
      )
  );
$$;

INSERT INTO public.task_assignees (task_id, user_id, assigned_by, assignment_status)
SELECT mi.task_id, mi.invitee_user_id, mi.invited_by,
       CASE WHEN mi.status = 'accepted' THEN 'accepted' ELSE 'pending' END
FROM public.meeting_invitations mi
WHERE mi.invitee_user_id IS NOT NULL
  AND mi.status <> 'declined'
ON CONFLICT (task_id, user_id) DO UPDATE
SET assigned_by = COALESCE(public.task_assignees.assigned_by, EXCLUDED.assigned_by),
    assignment_status = CASE
      WHEN EXCLUDED.assignment_status = 'accepted' THEN 'accepted'
      ELSE public.task_assignees.assignment_status
    END;

CREATE OR REPLACE FUNCTION public.handle_new_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_title text;
  t_due timestamptz;
  t_workspace uuid;
BEGIN
  IF NEW.invitee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.invitee_user_id <> NEW.invited_by THEN
    INSERT INTO public.task_assignees (task_id, user_id, assigned_by, assignment_status)
    VALUES (NEW.task_id, NEW.invitee_user_id, NEW.invited_by, 'pending')
    ON CONFLICT (task_id, user_id) DO NOTHING;
  END IF;

  IF NEW.invitee_user_id = NEW.invited_by THEN
    RETURN NEW;
  END IF;

  SELECT t.title, t.due_at, t.workspace_id INTO t_title, t_due, t_workspace
  FROM public.tasks t WHERE t.id = NEW.task_id;

  INSERT INTO public.notifications (user_id, type, workspace_id, payload)
  VALUES (
    NEW.invitee_user_id,
    'meeting_invite',
    t_workspace,
    jsonb_build_object(
      'task_id', NEW.task_id,
      'invitation_id', NEW.id,
      'task_title', t_title,
      'due_at', t_due,
      'invited_by', NEW.invited_by
    )
  );

  RETURN NEW;
END;
$$;

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

  IF NEW.invitee_user_id IS NOT NULL THEN
    IF NEW.status = 'declined' THEN
      DELETE FROM public.task_assignees
      WHERE task_id = NEW.task_id
        AND user_id = NEW.invitee_user_id;
    ELSE
      INSERT INTO public.task_assignees (task_id, user_id, assigned_by, assignment_status)
      VALUES (
        NEW.task_id,
        NEW.invitee_user_id,
        NEW.invited_by,
        CASE WHEN NEW.status = 'accepted' THEN 'accepted' ELSE 'pending' END
      )
      ON CONFLICT (task_id, user_id) DO UPDATE
      SET assignment_status = EXCLUDED.assignment_status,
          assigned_by = COALESCE(public.task_assignees.assigned_by, EXCLUDED.assigned_by);
    END IF;
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