import { create } from 'zustand';

interface TaskDetailState {
  taskId: string | null;
  occurrenceDate: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  open: (id: string, context?: { occurrenceDate?: string; rangeStart?: string; rangeEnd?: string }) => void;
  close: () => void;
}

export const useTaskDetailStore = create<TaskDetailState>()((set) => ({
  taskId: null,
  occurrenceDate: null,
  rangeStart: null,
  rangeEnd: null,
  open: (id, context) => set({
    taskId: id,
    occurrenceDate: context?.occurrenceDate ?? null,
    rangeStart: context?.rangeStart ?? null,
    rangeEnd: context?.rangeEnd ?? null,
  }),
  close: () => set({ taskId: null, occurrenceDate: null, rangeStart: null, rangeEnd: null }),
}));
