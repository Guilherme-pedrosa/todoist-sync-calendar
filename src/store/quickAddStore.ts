import { create } from 'zustand';

interface QuickAddState {
  open: boolean;
  defaultProjectId?: string | null;
  defaultParentId?: string | null;
  openQuickAdd: (opts?: { defaultProjectId?: string | null; defaultParentId?: string | null }) => void;
  closeQuickAdd: () => void;
}

export const useQuickAddStore = create<QuickAddState>()((set) => ({
  open: false,
  defaultProjectId: null,
  defaultParentId: null,
  openQuickAdd: (opts) =>
    set({
      open: true,
      defaultProjectId: opts?.defaultProjectId ?? null,
      defaultParentId: opts?.defaultParentId ?? null,
    }),
  closeQuickAdd: () => set({ open: false, defaultProjectId: null, defaultParentId: null }),
}));
