import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;

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
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
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
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
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
    return null;
  },

  uploadAttachment: async (conversationId, file) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
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
            supabase.auth.getUser().then(({ data }) => {
              const uid = data?.user?.id;
              if (msg.userId !== uid && s.activeConversationId !== msg.conversationId) {
                set((ss) => ({
                  unreadByConversation: {
                    ...ss.unreadByConversation,
                    [msg.conversationId]: (ss.unreadByConversation[msg.conversationId] || 0) + 1,
                  },
                }));
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
          const { data: userData } = await supabase.auth.getUser();
          const uid = userData?.user?.id;
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
