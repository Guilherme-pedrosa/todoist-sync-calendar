import { create } from 'zustand';
import type { Task } from '@/types/task';

export type RecurringEditMode = 'single' | 'weekday' | 'series';

interface PendingEdit {
  taskId: string;
  /** The yyyy-MM-dd of the occurrence the user is editing (may differ from task.dueDate) */
  occurrenceDate: string;
  updates: Partial<Task>;
  operation?: 'update' | 'delete';
  /** Optional friendly description of what's changing, shown in the dialog */
  changeLabel?: string;
}

interface RecurringEditStore {
  pending: PendingEdit | null;
  resolver: ((mode: RecurringEditMode | null) => void) | null;
  /**
   * Open the dialog and wait for the user's choice.
   * Resolves to 'single', 'series', or null (cancelled).
   */
  ask: (edit: PendingEdit) => Promise<RecurringEditMode | null>;
  resolve: (mode: RecurringEditMode | null) => void;
}

export const useRecurringEditStore = create<RecurringEditStore>((set, get) => ({
  pending: null,
  resolver: null,
  ask: (edit) =>
    new Promise<RecurringEditMode | null>((resolve) => {
      set({ pending: edit, resolver: resolve });
    }),
  resolve: (mode) => {
    const r = get().resolver;
    if (r) r(mode);
    set({ pending: null, resolver: null });
  },
}));
