import { create } from 'zustand';
import type { Task } from '@/types/task';

interface TaskDetailState {
  taskId: string | null;
  taskSnapshot: Task | null;
  occurrenceDate: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  open: (
    id: string,
    context?: {
      occurrenceDate?: string;
      rangeStart?: string;
      rangeEnd?: string;
      taskSnapshot?: Task;
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
  open: (id, context) => set({
    taskId: id,
    taskSnapshot: context?.taskSnapshot
      ? { ...context.taskSnapshot, id }
      : null,
    occurrenceDate: context?.occurrenceDate ?? null,
    rangeStart: context?.rangeStart ?? null,
    rangeEnd: context?.rangeEnd ?? null,
  }),
  close: () => set({
    taskId: null,
    taskSnapshot: null,
    occurrenceDate: null,
    rangeStart: null,
    rangeEnd: null,
  }),
}));
