import { create } from 'zustand';
import type { Task } from '@/types/task';

interface TaskDetailState {
  taskId: string | null;
  taskSnapshot: Task | null;
  occurrenceDate: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  openChat: boolean;
  open: (
    id: string,
    context?: {
      occurrenceDate?: string;
      rangeStart?: string;
      rangeEnd?: string;
      taskSnapshot?: Task;
      openChat?: boolean;
    }
  ) => void;
  close: () => void;
}

export const useTaskDetailStore = create<TaskDetailState>()((set) => ({
  taskId: null,
  taskSnapshot: null,
  occurrenceDate: null,
  rangeStart: null,
  rangeEnd: null,
  openChat: false,
  open: (id, context) => set({
    taskId: id,
    taskSnapshot: context?.taskSnapshot
      ? { ...context.taskSnapshot, id }
      : null,
    occurrenceDate: context?.occurrenceDate ?? null,
    rangeStart: context?.rangeStart ?? null,
    rangeEnd: context?.rangeEnd ?? null,
    openChat: context?.openChat ?? false,
  }),
  close: () => set({
    taskId: null,
    taskSnapshot: null,
    occurrenceDate: null,
    rangeStart: null,
    rangeEnd: null,
    openChat: false,
  }),
}));
