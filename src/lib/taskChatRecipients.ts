import { supabase } from '@/integrations/supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function addUserId(ids: Set<string>, value: unknown) {
  if (typeof value === 'string' && UUID_RE.test(value)) ids.add(value);
}

type TaskAssigneeRow = { user_id?: string | null; assignment_status?: string | null };

/**
 * Recipients de chat de tarefa = APENAS quem está vinculado em task_assignees
 * (responsáveis + informados, exceto quem recusou).
 *
 * Importante: NÃO incluir mais o `created_by`/`user_id` da task, senão quem
 * criou a tarefa e depois saiu dela continua recebendo notificação.
 */
export async function getTaskChatRecipientIds(taskId: string): Promise<string[]> {
  const { data: assignees } = await supabase
    .from('task_assignees')
    .select('user_id, assignment_status')
    .eq('task_id', taskId);

  const ids = new Set<string>();
  for (const assignee of assignees || []) {
    const row = assignee as TaskAssigneeRow;
    if (row.assignment_status === 'declined') continue;
    addUserId(ids, row.user_id);
  }

  return [...ids];
}
