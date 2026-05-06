import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Event bus para notificar a UI quando chega mensagem nova de outro usuário
export type IncomingChatEvent = {
  message: { id: string; conversationId: string; userId: string; body: string };
  conversationTitle: string | null;
  conversationType: 'workspace' | 'task' | 'context';
  taskId: string | null;
};
type ChatListener = (e: IncomingChatEvent) => void;
const chatListeners = new Set<ChatListener>();
export function onIncomingChatMessage(fn: ChatListener) {
  chatListeners.add(fn);
  return () => chatListeners.delete(fn);
}
function emitIncomingChat(e: IncomingChatEvent) {
  chatListeners.forEach((fn) => {
    try { fn(e); } catch { /* noop */ }
  });
}

export type ConversationType = 'workspace' | 'task' | 'context';

export interface Conversation {
  id: string;
  workspaceId: string;
  type: ConversationType;
  taskId: string | null;
  title: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  externalContextId?: string | null;
}

export interface ChatAttachment {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  body: string;
  mentions: string[];
  attachments: ChatAttachment[];
  editedAt: string | null;
  createdAt: string;
}

export interface Participant {
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadAt: string | null;
}

interface ChatState {
  conversations: Conversation[];
  participants: Participant[];
  messagesByConversation: Record<string, Message[]>;
  unreadByConversation: Record<string, number>;
  loading: boolean;
  activeConversationId: string | null;
  channel: RealtimeChannel | null;

  fetchConversations: (workspaceId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (
    conversationId: string,
    body: string,
    attachments?: ChatAttachment[],
    mentions?: string[]
  ) => Promise<void>;
  editMessage: (messageId: string, conversationId: string, body: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  ensureTaskConversation: (taskId: string) => Promise<string | null>;
  ensureContextConversation: (contextId: string, title?: string) => Promise<string | null>;
  subscribeRealtime: (workspaceId: string) => void;
  unsubscribeRealtime: () => void;
  uploadAttachment: (conversationId: string, file: File) => Promise<ChatAttachment | null>;
}

function mapConv(row: any): Conversation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    taskId: row.task_id,
    title: row.title,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    externalContextId: row.external_context_id ?? null,
  };
}

function mapMsg(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    body: row.body,
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch (error) {
    console.warn('Falha ao obter usuário atual', error);
    return null;
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  participants: [],
  messagesByConversation: {},
  unreadByConversation: {},
  loading: false,
  activeConversationId: null,
  channel: null,

  fetchConversations: async (workspaceId) => {
    set({ loading: true });
    const { data: convRows } = await supabase
      .from('conversations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });

    const conversations = (convRows || []).map(mapConv);
    const ids = conversations.map((c) => c.id);

    let participants: Participant[] = [];
    const unread: Record<string, number> = {};

    if (ids.length > 0) {
      const uid = await getCurrentUserId();

      const { data: partRows } = await supabase
        .from('conversation_participants')
        .select('*')
        .in('conversation_id', ids);

      participants = (partRows || []).map((p: any) => ({
        conversationId: p.conversation_id,
        userId: p.user_id,
        joinedAt: p.joined_at,
        lastReadAt: p.last_read_at,
      }));

      // Compute unread counts (mensagens depois de last_read_at, não próprias)
      if (uid) {
        for (const c of conversations) {
          const myPart = participants.find((p) => p.conversationId === c.id && p.userId === uid);
          const since = myPart?.lastReadAt;
          let q = supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', c.id)
            .neq('user_id', uid);
          if (since) q = q.gt('created_at', since);
          const { count } = await q;
          unread[c.id] = count || 0;
        }
      }
    }

    set({ conversations, participants, unreadByConversation: unread, loading: false });
  },

  fetchMessages: async (conversationId) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500);

    const messages = (data || []).map(mapMsg);
    set((state) => ({
      messagesByConversation: { ...state.messagesByConversation, [conversationId]: messages },
    }));
  },

  sendMessage: async (conversationId, body, attachments = [], mentions = []) => {
    const uid = await getCurrentUserId();
    if (!uid || !body.trim()) return;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: uid,
        body: body.trim(),
        attachments: attachments as any,
        mentions: mentions as any,
      })
      .select()
      .single();

    if (error || !data) return;
    // Realtime vai entregar — mas adiciona otimisticamente caso o canal demore
    const msg = mapMsg(data);
    set((state) => {
      const current = state.messagesByConversation[conversationId] || [];
      if (current.some((m) => m.id === msg.id)) return state;
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...current, msg],
        },
      };
    });
  },

  editMessage: async (messageId, conversationId, body) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from('messages')
      .update({ body: trimmed })
      .eq('id', messageId);
    if (error) return;
    set((state) => {
      const list = state.messagesByConversation[conversationId] || [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: list.map((m) =>
            m.id === messageId ? { ...m, body: trimmed, editedAt: new Date().toISOString() } : m
          ),
        },
      };
    });
  },

  markRead: async (conversationId) => {
    const uid = await getCurrentUserId();
    if (!uid) return;
    const now = new Date().toISOString();
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: now })
      .eq('conversation_id', conversationId)
      .eq('user_id', uid);
    set((state) => ({
      unreadByConversation: { ...state.unreadByConversation, [conversationId]: 0 },
      participants: state.participants.map((p) =>
        p.conversationId === conversationId && p.userId === uid ? { ...p, lastReadAt: now } : p
      ),
    }));
    // Also mark related chat notifications as read so the bell badge clears.
    try {
      const { useNotificationStore } = await import('@/store/notificationStore');
      useNotificationStore.getState().markReadForConversation(conversationId);
    } catch {
      /* noop */
    }
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  ensureTaskConversation: async (taskId) => {
    const existing = get().conversations.find((c) => c.taskId === taskId);
    if (existing) return existing.id;

    // Pode ainda não estar no estado — busca direto
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('task_id', taskId)
      .maybeSingle();

    if (data) {
      const conv = mapConv(data);
      set((state) => ({
        conversations: [conv, ...state.conversations.filter((c) => c.id !== conv.id)],
      }));
      return conv.id;
    }

    // Não existe — cria sob demanda
    const uid = await getCurrentUserId();
    if (!uid) return null;

    const { data: taskRow } = await supabase
      .from('tasks')
      .select('id, title, project_id, projects:project_id(workspace_id)')
      .eq('id', taskId)
      .maybeSingle();

    const workspaceId = (taskRow as any)?.projects?.workspace_id as string | undefined;
    if (!workspaceId) return null;

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        type: 'task',
        task_id: taskId,
        title: (taskRow as any)?.title ?? null,
        created_by: uid,
      })
      .select()
      .single();

    if (error || !created) {
      console.error('ensureTaskConversation create failed', error);
      return null;
    }

    const conv = mapConv(created);
    set((state) => ({
      conversations: [conv, ...state.conversations.filter((c) => c.id !== conv.id)],
    }));

    await supabase
      .from('conversation_participants')
      .insert({ conversation_id: conv.id, user_id: uid });

    return conv.id;
  },

  ensureContextConversation: async (contextId, title) => {
    const trimmedId = contextId?.trim();
    if (!trimmedId) return null;

    const uid = await getCurrentUserId();
    if (!uid) return null;

    // Find personal workspace of the current user
    const { data: ws } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', uid)
      .eq('is_personal', true)
      .maybeSingle();
    if (!ws?.id) return null;

    // Check existing conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('workspace_id', ws.id)
      .eq('external_context_id', trimmedId)
      .maybeSingle();

    if (existing) {
      const conv = mapConv(existing);
      set((state) => ({
        conversations: [conv, ...state.conversations.filter((c) => c.id !== conv.id)],
      }));
      // Ensure participant
      await supabase
        .from('conversation_participants')
        .insert({ conversation_id: conv.id, user_id: uid })
        .select()
        .maybeSingle();
      return conv.id;
    }

    // Create new
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        workspace_id: ws.id,
        type: 'context' as any,
        external_context_id: trimmedId,
        title: title?.trim() || `Contexto ${trimmedId}`,
        created_by: uid,
      })
      .select()
      .single();

    if (error || !created) return null;

    const conv = mapConv(created);
    set((state) => ({
      conversations: [conv, ...state.conversations.filter((c) => c.id !== conv.id)],
    }));

    // Add self as participant (criador deve participar)
    await supabase
      .from('conversation_participants')
      .insert({ conversation_id: conv.id, user_id: uid });

    return conv.id;
  },

  uploadAttachment: async (conversationId, file) => {
    const uid = await getCurrentUserId();
    if (!uid) return null;
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${conversationId}/${uid}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return null;
    return {
      path,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
    };
  },

  subscribeRealtime: (workspaceId) => {
    const existing = get().channel;
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(`chat-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = mapMsg(payload.new);
          const state = get();
          const conv = state.conversations.find((c) => c.id === msg.conversationId);
          if (!conv) return;

          set((s) => {
            const list = s.messagesByConversation[msg.conversationId] || [];
            if (list.some((m) => m.id === msg.id)) return s;
            const newMessages = {
              ...s.messagesByConversation,
              [msg.conversationId]: [...list, msg],
            };
            // unread bump se não for ativa nem própria
            getCurrentUserId().then((uid) => {
              if (msg.userId !== uid && s.activeConversationId !== msg.conversationId) {
                set((ss) => ({
                  unreadByConversation: {
                    ...ss.unreadByConversation,
                    [msg.conversationId]: (ss.unreadByConversation[msg.conversationId] || 0) + 1,
                  },
                }));
                emitIncomingChat({
                  message: {
                    id: msg.id,
                    conversationId: msg.conversationId,
                    userId: msg.userId,
                    body: msg.body,
                  },
                  conversationTitle: conv.title,
                  conversationType: conv.type,
                  taskId: conv.taskId,
                });
              }
            });
            return { messagesByConversation: newMessages };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = mapMsg(payload.new);
          set((s) => {
            const list = s.messagesByConversation[msg.conversationId];
            if (!list) return s;
            return {
              messagesByConversation: {
                ...s.messagesByConversation,
                [msg.conversationId]: list.map((m) => (m.id === msg.id ? msg : m)),
              },
            };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const conv = mapConv(payload.new);
          set((s) => ({
            conversations: [conv, ...s.conversations.filter((c) => c.id !== conv.id)],
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_participants' },
        async (payload) => {
          // Quando viro participante de uma conversa nova (ex.: fui adicionado como responsável),
          // re-busca a lista para incluí-la.
          const uid = await getCurrentUserId();
          const newRow: any = payload.new;
          if (!uid || newRow.user_id !== uid) return;
          if (get().conversations.some((c) => c.id === newRow.conversation_id)) return;
          await get().fetchConversations(workspaceId);
        }
      )
      .subscribe();

    set({ channel });
  },

  unsubscribeRealtime: () => {
    const ch = get().channel;
    if (ch) supabase.removeChannel(ch);
    set({ channel: null });
  },
}));
