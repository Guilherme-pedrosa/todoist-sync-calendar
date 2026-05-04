
-- 1) Colunas em tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_meeting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS gcal_event_id text;

-- 2) Tabela meeting_invitations
CREATE TABLE IF NOT EXISTS public.meeting_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  invitee_user_id uuid,
  invitee_email text,
  invitee_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  invited_by uuid NOT NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (invitee_user_id IS NOT NULL OR invitee_email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_meeting_invitations_task ON public.meeting_invitations(task_id);
CREATE INDEX IF NOT EXISTS idx_meeting_invitations_user ON public.meeting_invitations(invitee_user_id) WHERE invitee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_invitations_email ON public.meeting_invitations(invitee_email) WHERE invitee_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_invitations_task_user ON public.meeting_invitations(task_id, invitee_user_id) WHERE invitee_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_invitations_task_email ON public.meeting_invitations(task_id, invitee_email) WHERE invitee_email IS NOT NULL;

ALTER TABLE public.meeting_invitations ENABLE ROW LEVEL SECURITY;

-- SELECT: dono da tarefa (acesso ao projeto) ou o próprio convidado
CREATE POLICY "view meeting invitations"
ON public.meeting_invitations FOR SELECT
USING (
  invitee_user_id = auth.uid()
  OR public.has_task_access(task_id, auth.uid())
);

-- INSERT: quem tem acesso à tarefa
CREATE POLICY "create meeting invitations"
ON public.meeting_invitations FOR INSERT
WITH CHECK (
  invited_by = auth.uid()
  AND public.has_task_access(task_id, auth.uid())
);

-- UPDATE: convidado pode atualizar próprio status; criador pode editar
CREATE POLICY "update own invitation status"
ON public.meeting_invitations FOR UPDATE
USING (
  invitee_user_id = auth.uid()
  OR public.has_task_access(task_id, auth.uid())
);

-- DELETE: criador da tarefa
CREATE POLICY "delete meeting invitations"
ON public.meeting_invitations FOR DELETE
USING (public.has_task_access(task_id, auth.uid()));

-- 3) Trigger: notificar convidado quando criado o convite
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
    RETURN NEW; -- convidado externo (sem user) será notificado por e-mail
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

DROP TRIGGER IF EXISTS trg_new_meeting_invitation ON public.meeting_invitations;
CREATE TRIGGER trg_new_meeting_invitation
AFTER INSERT ON public.meeting_invitations
FOR EACH ROW EXECUTE FUNCTION public.handle_new_meeting_invitation();

-- 4) Trigger: notificar criador quando o convidado aceita/recusa
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
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('accepted','declined') THEN
    RETURN NEW;
  END IF;

  SELECT t.title, t.workspace_id INTO t_title, t_workspace
  FROM public.tasks t WHERE t.id = NEW.task_id;

  SELECT COALESCE(p.display_name, NEW.invitee_name, NEW.invitee_email)
  INTO inv_name
  FROM public.profiles p
  WHERE p.user_id = NEW.invitee_user_id;

  INSERT INTO public.notifications (user_id, type, workspace_id, payload)
  VALUES (
    NEW.invited_by,
    CASE WHEN NEW.status = 'accepted' THEN 'meeting_accepted' ELSE 'meeting_declined' END,
    t_workspace,
    jsonb_build_object(
      'task_id', NEW.task_id,
      'invitation_id', NEW.id,
      'task_title', t_title,
      'invitee_name', COALESCE(inv_name, 'Convidado'),
      'invitee_user_id', NEW.invitee_user_id
    )
  );

  NEW.responded_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_invitation_response ON public.meeting_invitations;
CREATE TRIGGER trg_meeting_invitation_response
BEFORE UPDATE ON public.meeting_invitations
FOR EACH ROW EXECUTE FUNCTION public.handle_meeting_invitation_response();
