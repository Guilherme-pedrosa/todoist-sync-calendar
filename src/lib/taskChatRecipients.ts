import { supabase } from '@/integrations/supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function addUserId(ids: Set<string>, value: unknown) {
  if (typeof value === 'string' && UUID_RE.test(value)) ids.add(value);
}

type TaskOwnerRow = { user_id?: string | null; created_by?: string | null } | null;
type TaskAssigneeRow = { user_id?: string | null; assignment_status?: string | null };

export async function getTaskChatRecipientIds(taskId: string): Promise<string[]> {
  const [{ data: taskRow }, { data: assignees }] = await Promise.all([
    supabase.from('tasks').select('user_id, created_by').eq('id', taskId).maybeSingle(),
    supabase.from('task_assignees').select('user_id, assignment_status').eq('task_id', taskId),
  ]);

  const ids = new Set<string>();
  const owner = taskRow as TaskOwnerRow;
  addUserId(ids, owner?.created_by);
  addUserId(ids, owner?.user_id);

  for (const assignee of assignees || []) {
    const row = assignee as TaskAssigneeRow;
    if (row.assignment_status === 'declined') continue;
    addUserId(ids, row.user_id);
  }

  return [...ids];
}
