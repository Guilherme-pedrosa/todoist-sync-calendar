import { supabase } from '@/integrations/supabase/client';

type ReturnTaskRpcResult = {
  task_id?: string;
  returned_to_user_id?: string;
};

export async function returnTaskToAssigner(taskId: string, reason: string) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error('Informe o motivo da devolução');

  const { data, error } = await supabase.rpc('return_task_to_assigner', {
    p_task_id: taskId,
    p_reason: normalizedReason,
  });

  if (error) throw error;

  const result = (data ?? {}) as ReturnTaskRpcResult;
  if (!result.returned_to_user_id) {
    throw new Error('O banco não confirmou para quem a tarefa foi devolvida');
  }

  return {
    taskId: result.task_id ?? taskId,
    returnedToUserId: result.returned_to_user_id,
  };
}
