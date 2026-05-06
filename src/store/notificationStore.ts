import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useTaskStore } from '@/store/taskStore';

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  workspaceId: string | null;
  payload: Record<string, any>;
  readAt: string | null;
  createdAt: string;
}

interface State {
  items: AppNotification[];
  loading: boolean;
  channel: RealtimeChannel | null;

  fetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markReadForConversation: (conversationId: string) => void;
  subscribe: (userId: string) => void;
  unsubscribe: () => void;
  pushLocal: (n: AppNotification) => void;
}

function mapRow(row: any): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    workspaceId: row.workspace_id,
    payload: row.payload || {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

const TASK_SYNC_NOTIFICATION_TYPES = new Set([
  'meeting_invite',
  'task_assigned',
]);

export const useNotificationStore = create<State>((set, get) => ({
  items: [],
  loading: false,
  channel: null,

  fetch: async () => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) set({ items: data.map(mapRow) });
    set({ loading: false });
  },

  markRead: async (id) => {
    const now = new Date().toISOString();
    set({
      items: get().items.map((n) => (n.id === id ? { ...n, readAt: now } : n)),
    });
    await supabase.from('notifications').update({ read_at: now }).eq('id', id);
  },

  markAllRead: async () => {
    const now = new Date().toISOString();
    const ids = get().items.filter((n) => !n.readAt).map((n) => n.id);
    if (ids.length === 0) return;
    set({
      items: get().items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
    });
    await supabase.from('notifications').update({ read_at: now }).in('id', ids);
  },

  markReadForConversation: async (conversationId) => {
    const now = new Date().toISOString();
    const matching = get().items.filter(
      (n) => !n.readAt && n.payload?.conversation_id === conversationId
    );
    if (matching.length === 0) return;
    const ids = matching.map((n) => n.id);
    set({
      items: get().items.map((n) =>
        ids.includes(n.id) ? { ...n, readAt: now } : n
      ),
    });
    await supabase.from('notifications').update({ read_at: now }).in('id', ids);
  },

  pushLocal: (n) => {
    if (get().items.find((x) => x.id === n.id)) return;
    set({ items: [n, ...get().items].slice(0, 100) });
  },

  subscribe: (userId) => {
    get().unsubscribe();
    const ch = supabase
      .channel(`notifications-store-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = mapRow(payload.new);
          get().pushLocal(notification);

          if (TASK_SYNC_NOTIFICATION_TYPES.has(notification.type) && notification.payload?.task_id) {
            void useTaskStore.getState().fetchData();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = mapRow(payload.new);
          set({
            items: get().items.map((n) => (n.id === updated.id ? updated : n)),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const id = (payload.old as any)?.id;
          if (!id) return;
          set({ items: get().items.filter((n) => n.id !== id) });
        }
      )
      .subscribe();
    set({ channel: ch });
  },

  unsubscribe: () => {
    const ch = get().channel;
    if (ch) supabase.removeChannel(ch);
    set({ channel: null });
  },
}));
