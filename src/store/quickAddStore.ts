import { create } from 'zustand';

interface QuickAddState {
  open: boolean;
  defaultProjectId?: string | null;
  defaultParentId?: string | null;
  defaultDueDate?: string | null;
  defaultDueTime?: string | null;
  defaultDurationMinutes?: number | null;
  openQuickAdd: (opts?: {
    defaultProjectId?: string | null;
    defaultParentId?: string | null;
    defaultDueDate?: string | null;
    defaultDueTime?: string | null;
    defaultDurationMinutes?: number | null;
  }) => void;
  closeQuickAdd: () => void;
}

export const useQuickAddStore = create<QuickAddState>()((set) => ({
  open: false,
  defaultProjectId: null,
  defaultParentId: null,
  defaultDueDate: null,
  defaultDueTime: null,
  defaultDurationMinutes: null,
  openQuickAdd: (opts) =>
    set({
      open: true,
      defaultProjectId: opts?.defaultProjectId ?? null,
      defaultParentId: opts?.defaultParentId ?? null,
      defaultDueDate: opts?.defaultDueDate ?? null,
      defaultDueTime: opts?.defaultDueTime ?? null,
      defaultDurationMinutes: opts?.defaultDurationMinutes ?? null,
    }),
  closeQuickAdd: () =>
    set({
      open: false,
      defaultProjectId: null,
      defaultParentId: null,
      defaultDueDate: null,
      defaultDueTime: null,
      defaultDurationMinutes: null,
    }),
}));
