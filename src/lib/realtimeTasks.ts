import { supabase } from '@/integrations/supabase/client';
import { useTaskStore } from '@/store/taskStore';
import { useCommentsStore } from '@/store/commentsStore';

let tasksChannel: ReturnType<typeof supabase.channel> | null = null;
let commentsChannel: ReturnType<typeof supabase.channel> | null = null;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Fallback full refetch — only used when an incremental apply isn't possible
 * (e.g., realtime channel error/reconnect, or unhandled event).
 */
function scheduleResync(reason: string) {
  console.info('[realtime] schedule resync reason=', reason);
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    void useTaskStore.getState().fetchData();
  }, 800);
}

function handleTaskEvent(payload: any) {
  const t0 = performance.now();
  const store = useTaskStore.getState();
  try {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      // Soft-delete: trata UPDATE com deleted_at preenchido como remoção.
      if (payload.new?.deleted_at) {
        const id = payload.new?.id;
        if (id) store.applyTaskDelete(id);
      } else {
        store.applyTaskUpsertFromDb(payload.new);
      }
    } else if (payload.eventType === 'DELETE') {
      const id = payload.old?.id;
      if (id) store.applyTaskDelete(id);
    }
    console.info('[realtime] task applied in', Math.round(performance.now() - t0), 'ms', payload.eventType);
  } catch (e) {
    console.error('[realtime] task apply failed, falling back to resync', e);
    scheduleResync('task-apply-error');
  }
}

function handleProjectEvent(payload: any) {
  const store = useTaskStore.getState();
  try {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      store.applyProjectUpsertFromDb(payload.new);
    } else if (payload.eventType === 'DELETE') {
      const id = payload.old?.id;
      if (id) store.applyProjectDelete(id);
    }
  } catch (e) {
    console.error('[realtime] project apply failed', e);
    scheduleResync('project-apply-error');
  }
}

function handleAssigneeEvent(payload: any) {
  const store = useTaskStore.getState();
  try {
    if (payload.eventType === 'INSERT') {
      store.applyTaskAssigneeChange(payload.new.task_id, payload.new.user_id, 'add');
    } else if (payload.eventType === 'DELETE') {
      store.applyTaskAssigneeChange(payload.old.task_id, payload.old.user_id, 'remove');
    }
    // UPDATE on assignment_status doesn't change membership; ignore for store.
  } catch (e) {
    console.error('[realtime] assignee apply failed', e);
    scheduleResync('assignee-apply-error');
  }
}

function handleLabelEvent(payload: any) {
  const store = useTaskStore.getState();
  try {
    if (payload.eventType === 'INSERT') {
      store.applyTaskLabelChange(payload.new.task_id, payload.new.label_id, 'add');
    } else if (payload.eventType === 'DELETE') {
      store.applyTaskLabelChange(payload.old.task_id, payload.old.label_id, 'remove');
    }
  } catch (e) {
    console.error('[realtime] label apply failed', e);
    scheduleResync('label-apply-error');
  }
}

function handleMeetingInvitationEvent(payload: any) {
  const store = useTaskStore.getState();
  try {
    if (payload.eventType === 'INSERT') {
      store.applyMeetingInvitationChange(payload.new.task_id, payload.new.invitee_user_id, 'add');
    } else if (payload.eventType === 'DELETE') {
      store.applyMeetingInvitationChange(payload.old.task_id, payload.old.invitee_user_id, 'remove');
    }
  } catch (e) {
    console.error('[realtime] meeting invitation apply failed', e);
    scheduleResync('mi-apply-error');
  }
}

function handleSectionEvent(_payload: any) {
  // Sections aren't kept in the task store directly; trigger a light resync.
  scheduleResync('section-changed');
}

export function subscribeToTaskRealtime(userId: string) {
  if (tasksChannel) return () => unsubscribeFromTaskRealtime();

  tasksChannel = supabase
    .channel(`tasks-realtime-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, handleTaskEvent)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, handleProjectEvent)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, handleSectionEvent)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_labels' }, handleLabelEvent)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, handleAssigneeEvent)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_invitations' }, handleMeetingInvitationEvent)
    .subscribe((status) => {
      console.info('[realtime] tasks channel status', status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        scheduleResync('channel-' + status);
      }
    });

  // Global comments channel — increments unread per task even when the panel is closed.
  commentsChannel = supabase
    .channel(`comments-global-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, (payload) => {
      const row: any = payload.new;
      if (!row?.task_id) return;
      // Don't badge our own comments.
      if (row.user_id === userId) return;
      useCommentsStore.getState().incrementUnread(row.task_id);
    })
    .subscribe((status) => {
      console.info('[realtime] comments channel status', status);
    });

  return () => unsubscribeFromTaskRealtime();
}

export function unsubscribeFromTaskRealtime() {
  if (resyncTimer) {
    clearTimeout(resyncTimer);
    resyncTimer = null;
  }
  if (tasksChannel) {
    void supabase.removeChannel(tasksChannel);
    tasksChannel = null;
  }
  if (commentsChannel) {
    void supabase.removeChannel(commentsChannel);
    commentsChannel = null;
  }
}
