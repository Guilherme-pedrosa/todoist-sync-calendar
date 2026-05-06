import { create } from 'zustand';

interface CommentsState {
  /** unread count per task_id */
  unreadByTask: Record<string, number>;
  /** total unread (cached) */
  totalUnread: number;

  incrementUnread: (taskId: string) => void;
  clearUnread: (taskId: string) => void;
  resetAll: () => void;
}

export const useCommentsStore = create<CommentsState>()((set) => ({
  unreadByTask: {},
  totalUnread: 0,

  incrementUnread: (taskId) =>
    set((state) => {
      const next = { ...state.unreadByTask, [taskId]: (state.unreadByTask[taskId] || 0) + 1 };
      return { unreadByTask: next, totalUnread: state.totalUnread + 1 };
    }),

  clearUnread: (taskId) =>
    set((state) => {
      const current = state.unreadByTask[taskId] || 0;
      if (current === 0) return state;
      const next = { ...state.unreadByTask };
      delete next[taskId];
      return { unreadByTask: next, totalUnread: Math.max(0, state.totalUnread - current) };
    }),

  resetAll: () => set({ unreadByTask: {}, totalUnread: 0 }),
}));
