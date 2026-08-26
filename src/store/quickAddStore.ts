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
  openQuickAdd: (opts) => {
    // iOS/Safari só abre o teclado se o focus() acontecer no mesmo tick do gesto.
    // Focamos um campo "primer" já montado; o QuickAdd transfere o foco ao montar.
    if (typeof document !== 'undefined') {
      const primer = document.getElementById('quickadd-focus-primer') as HTMLInputElement | null;
      primer?.focus();
    }
    set({
      open: true,
      defaultProjectId: opts?.defaultProjectId ?? null,
      defaultParentId: opts?.defaultParentId ?? null,
      defaultDueDate: opts?.defaultDueDate ?? null,
      defaultDueTime: opts?.defaultDueTime ?? null,
      defaultDurationMinutes: opts?.defaultDurationMinutes ?? null,
    });
  },
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
