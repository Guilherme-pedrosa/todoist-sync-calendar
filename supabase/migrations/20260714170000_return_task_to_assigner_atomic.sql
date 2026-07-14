-- Devolve uma tarefa ao remetente em uma única transação.
-- Mantém a regra de produto: atribuição automática, sem aceite/rejeição,
-- com motivo obrigatório e notificação para quem atribuiu.
CREATE OR REPLACE FUNCTION public.return_task_to_assigner(
  p_task_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_assignment public.task_assignees%ROWTYPE;
  v_assigner uuid;
  v_reason text := trim(COALESCE(p_reason, ''));
BEGIN
  IF v_actor IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Sessão expirada, faça login';
  END IF;

  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'Tarefa inválida';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Informe o motivo da devolução';
  END IF;

  -- Trava a atribuição para impedir devoluções simultâneas/clique duplo.
  SELECT ta.*
  INTO v_assignment
  FROM public.task_assignees ta
  JOIN public.tasks t ON t.id = ta.task_id
  WHERE ta.task_id = p_task_id
    AND ta.user_id = v_actor
    AND ta.role = 'responsible'
    AND t.deleted_at IS NULL
    AND public.has_task_access(t.id, v_actor)
  FOR UPDATE OF ta;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você não é responsável por esta tarefa ou ela não está mais disponível';
  END IF;

  v_assigner := v_assignment.assigned_by;
  IF v_assigner IS NULL OR v_assigner = v_actor THEN
    RAISE EXCEPTION 'Não foi possível identificar quem atribuiu esta tarefa';
  END IF;

  -- Garante que o remetente está novamente na tarefa. assigned_by aponta
  -- temporariamente para ele mesmo para não gerar uma segunda notificação
  -- de nova atribuição; a notificação correta será a devolução com motivo.
  INSERT INTO public.task_assignees (
    task_id, user_id, assigned_by, assignment_status, role,
    response_reason, responded_at
  ) VALUES (
    p_task_id, v_assigner, v_assigner, 'accepted', 'responsible',
    NULL, NULL
  )
  ON CONFLICT (task_id, user_id) DO UPDATE
  SET role = 'responsible',
      assignment_status = 'accepted',
      assigned_by = v_assigner,
      response_reason = NULL,
      responded_at = NULL;

  -- O trigger existente gera a notificação de devolução com o motivo.
  UPDATE public.task_assignees
  SET assignment_status = 'returned',
      response_reason = v_reason
  WHERE task_id = p_task_id
    AND user_id = v_actor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A atribuição mudou durante a devolução; tente novamente';
  END IF;

  -- Preserva a cadeia de atribuição para uma eventual devolução futura.
  UPDATE public.task_assignees
  SET assigned_by = v_actor
  WHERE task_id = p_task_id
    AND user_id = v_assigner;

  DELETE FROM public.task_assignees
  WHERE task_id = p_task_id
    AND user_id = v_actor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível remover o responsável atual';
  END IF;

  RETURN jsonb_build_object(
    'task_id', p_task_id,
    'returned_to_user_id', v_assigner
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.return_task_to_assigner(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_task_to_assigner(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
