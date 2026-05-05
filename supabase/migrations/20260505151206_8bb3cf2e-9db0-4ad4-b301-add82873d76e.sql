-- Permitir que qualquer pessoa com acesso à tarefa veja a conversa, os participantes e mensagens da tarefa.
-- Mantém regra atual para conversas de workspace/canal (precisa estar em participants).

DROP POLICY IF EXISTS conv_select ON public.conversations;
CREATE POLICY conv_select ON public.conversations
FOR SELECT TO authenticated
USING (
  public.is_conversation_participant(id, auth.uid())
  OR (type = 'task' AND task_id IS NOT NULL AND public.has_task_access(task_id, auth.uid()))
);

DROP POLICY IF EXISTS msg_select ON public.messages;
CREATE POLICY msg_select ON public.messages
FOR SELECT TO authenticated
USING (
  public.is_conversation_participant(conversation_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.type = 'task'
      AND c.task_id IS NOT NULL
      AND public.has_task_access(c.task_id, auth.uid())
  )
);

-- Permitir inserir mensagens em conversas de tarefa às quais a pessoa tem acesso
DROP POLICY IF EXISTS msg_insert ON public.messages;
CREATE POLICY msg_insert ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_conversation_participant(conversation_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.type = 'task'
        AND c.task_id IS NOT NULL
        AND public.has_task_access(c.task_id, auth.uid())
    )
  )
);

-- Permitir ver participantes (para listar avatares/nomes) quando tem acesso à tarefa
DROP POLICY IF EXISTS cp_select ON public.conversation_participants;
CREATE POLICY cp_select ON public.conversation_participants
FOR SELECT TO authenticated
USING (
  public.is_conversation_participant(conversation_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND c.type = 'task'
      AND c.task_id IS NOT NULL
      AND public.has_task_access(c.task_id, auth.uid())
  )
);
