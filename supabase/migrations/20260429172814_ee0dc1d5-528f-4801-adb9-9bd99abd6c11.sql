-- ============================================
-- Sub-fase 2.B — Conversations & Messages
-- ============================================

-- 1. ENUM para tipo de conversa
CREATE TYPE public.conversation_type AS ENUM ('workspace', 'task');

-- 2. Tabela conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type public.conversation_type NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conv_task_required CHECK (
    (type = 'task' AND task_id IS NOT NULL) OR
    (type = 'workspace' AND task_id IS NULL)
  )
);

-- Apenas uma conversa por tarefa e uma por workspace
CREATE UNIQUE INDEX idx_conversations_unique_task ON public.conversations(task_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX idx_conversations_unique_workspace ON public.conversations(workspace_id) WHERE type = 'workspace';
CREATE INDEX idx_conversations_workspace ON public.conversations(workspace_id);

-- 3. Tabela conversation_participants
CREATE TABLE public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_cp_user ON public.conversation_participants(user_id);

-- 4. Tabela messages (sem deleted_at — mensagens são imutáveis)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL,
  mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_user ON public.messages(user_id);

-- 5. Security definer: é participante?
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$;

-- 6. Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 7. RLS conversations
CREATE POLICY conv_select ON public.conversations FOR SELECT
  USING (public.is_conversation_participant(id, auth.uid()));

CREATE POLICY conv_insert ON public.conversations FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND auth.uid() = created_by
  );

CREATE POLICY conv_update ON public.conversations FOR UPDATE
  USING (public.is_conversation_participant(id, auth.uid()));

-- 8. RLS conversation_participants
CREATE POLICY cp_select ON public.conversation_participants FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY cp_insert ON public.conversation_participants FOR INSERT
  WITH CHECK (
    -- pode adicionar a si mesmo OU se já é participante (admin da thread)
    user_id = auth.uid()
    OR public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY cp_update ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid()); -- só pode atualizar o próprio last_read_at

CREATE POLICY cp_delete ON public.conversation_participants FOR DELETE
  USING (user_id = auth.uid()); -- só pode sair de conversa por conta própria

-- 9. RLS messages (sem DELETE policy — não pode apagar)
CREATE POLICY msg_select ON public.messages FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY msg_insert ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY msg_update ON public.messages FOR UPDATE
  USING (auth.uid() = user_id); -- só edita a própria

-- 10. Trigger: criar conversa de workspace ao criar workspace
CREATE OR REPLACE FUNCTION public.handle_new_workspace_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.conversations (workspace_id, type, title, created_by)
  VALUES (NEW.id, 'workspace', NEW.name || ' — Geral', NEW.owner_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workspace_conversation
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_conversation();

-- 11. Trigger: adicionar membro do workspace na conversa-workspace
CREATE OR REPLACE FUNCTION public.handle_workspace_member_to_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id UUID;
BEGIN
  SELECT id INTO conv_id FROM public.conversations
    WHERE workspace_id = NEW.workspace_id AND type = 'workspace';
  IF conv_id IS NOT NULL THEN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (conv_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workspace_member_conversation
AFTER INSERT ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.handle_workspace_member_to_conversation();

-- 12. Trigger: criar conversa-tarefa para tarefas em workspace compartilhado
CREATE OR REPLACE FUNCTION public.handle_new_task_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_personal BOOLEAN;
  conv_id UUID;
BEGIN
  -- Só cria conversa para workspaces NÃO pessoais
  SELECT is_personal INTO ws_personal FROM public.workspaces WHERE id = NEW.workspace_id;
  IF COALESCE(ws_personal, true) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversations (workspace_id, type, task_id, title, created_by)
  VALUES (NEW.workspace_id, 'task', NEW.id, NEW.title, COALESCE(NEW.created_by, NEW.user_id))
  RETURNING id INTO conv_id;

  -- Criador entra automaticamente
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (conv_id, COALESCE(NEW.created_by, NEW.user_id))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_conversation
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_new_task_conversation();

-- 13. Trigger: adicionar assignee na conversa-tarefa
CREATE OR REPLACE FUNCTION public.handle_task_assignee_to_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id UUID;
BEGIN
  SELECT id INTO conv_id FROM public.conversations
    WHERE task_id = NEW.task_id;
  IF conv_id IS NOT NULL THEN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (conv_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignee_conversation
AFTER INSERT ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignee_to_conversation();

-- 14. Trigger: cada mensagem em conversa-tarefa gera entrada no task_activity_log
CREATE OR REPLACE FUNCTION public.handle_message_to_task_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_id UUID;
  snippet TEXT;
BEGIN
  SELECT task_id INTO t_id FROM public.conversations WHERE id = NEW.conversation_id;
  IF t_id IS NOT NULL THEN
    snippet := LEFT(NEW.body, 140);
    INSERT INTO public.task_activity_log (task_id, user_id, action, payload)
    VALUES (
      t_id,
      NEW.user_id,
      'message_sent',
      jsonb_build_object(
        'message_id', NEW.id,
        'snippet', snippet,
        'has_attachments', jsonb_array_length(NEW.attachments) > 0
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_message_task_log
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_message_to_task_log();

-- 15. Trigger: updated_at em conversations quando chega mensagem
CREATE OR REPLACE FUNCTION public.handle_conversation_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conv_touch
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_conversation_touch();

-- 16. Trigger: edited_at automático
CREATE OR REPLACE FUNCTION public.handle_message_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.body IS DISTINCT FROM NEW.body THEN
    NEW.edited_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_message_edit
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_message_edit();

-- 17. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- 18. Storage bucket para anexos (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: path = {conversation_id}/{user_id}/{filename}
CREATE POLICY "Participants can view chat attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND public.is_conversation_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Participants can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND public.is_conversation_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

-- 19. Backfill: conversas de workspace para workspaces existentes (não pessoais e pessoais)
INSERT INTO public.conversations (workspace_id, type, title, created_by)
SELECT w.id, 'workspace', w.name || ' — Geral', w.owner_id
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.workspace_id = w.id AND c.type = 'workspace'
);

-- Backfill: participants para membros existentes
INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT c.id, wm.user_id
FROM public.conversations c
JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
WHERE c.type = 'workspace'
ON CONFLICT DO NOTHING;