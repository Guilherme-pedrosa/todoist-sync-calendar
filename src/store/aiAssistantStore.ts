import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AssistantAction } from '@/lib/aiAssistant';

export type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  actions?: AssistantAction[];
  actionsState?: 'pending' | 'applied' | 'discarded';
  // Quando ações de criação são aplicadas, guardamos os IDs
  // criados (paralelo a actions[]) para virar links clicáveis.
  createdTaskIds?: (string | null)[];
};

interface AIAssistantState {
  isOpen: boolean;
  initialTab: 'chat' | 'analyze' | 'organize';
  messages: ChatMsg[];
  open: (tab?: 'chat' | 'analyze' | 'organize') => void;
  close: () => void;
  setMessages: (updater: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) => void;
  clearMessages: () => void;
}

export const useAIAssistantStore = create<AIAssistantState>()(
  persist(
    (set) => ({
      isOpen: false,
      initialTab: 'analyze',
      messages: [],
      open: (tab = 'analyze') => set({ isOpen: true, initialTab: tab }),
      close: () => set({ isOpen: false }),
      setMessages: (updater) =>
        set((state) => ({
          messages: typeof updater === 'function' ? (updater as (p: ChatMsg[]) => ChatMsg[])(state.messages) : updater,
        })),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: 'ai-assistant-chat',
      storage: createJSONStorage(() => localStorage),
      // Só persistimos histórico de conversa.
      partialize: (s) => ({ messages: s.messages }),
      version: 1,
    },
  ),
);
