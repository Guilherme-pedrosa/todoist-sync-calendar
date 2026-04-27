import { create } from 'zustand';

interface TaskDetailState {
  taskId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const useTaskDetailStore = create<TaskDetailState>()((set) => ({
  taskId: null,
  open: (id) => set({ taskId: id }),
  close: () => set({ taskId: null }),
}));
