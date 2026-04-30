import { supabase } from '@/integrations/supabase/client';
import { useTaskStore } from '@/store/taskStore';

let channel: ReturnType<typeof supabase.channel> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefetch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void useTaskStore.getState().fetchData();
  }, 400);
}

export function subscribeToTaskRealtime(userId: string) {
  // Already subscribed
  if (channel) return () => unsubscribeFromTaskRealtime();

  channel = supabase
    .channel(`tasks-realtime-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_labels' }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, scheduleRefetch)
    .subscribe();

  return () => unsubscribeFromTaskRealtime();
}

export function unsubscribeFromTaskRealtime() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}
