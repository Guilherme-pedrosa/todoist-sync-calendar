import { create } from 'zustand';

interface QuickAddState {
  open: boolean;
  defaultProjectId?: string | null;
  defaultParentId?: string | null;
  defaultDueDate?: string | null;
  openQuickAdd: (opts?: {
    defaultProjectId?: string | null;
    defaultParentId?: string | null;
    defaultDueDate?: string | null;
  }) => void;
  closeQuickAdd: () => void;
}

export const useQuickAddStore = create<QuickAddState>()((set) => ({
  open: false,
  defaultProjectId: null,
  defaultParentId: null,
  defaultDueDate: null,
  openQuickAdd: (opts) =>
    set({
      open: true,
      defaultProjectId: opts?.defaultProjectId ?? null,
      defaultParentId: opts?.defaultParentId ?? null,
      defaultDueDate: opts?.defaultDueDate ?? null,
    }),
  closeQuickAdd: () => set({ open: false, defaultProjectId: null, defaultParentId: null, defaultDueDate: null }),
}));
