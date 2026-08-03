import { create } from 'zustand';

interface PendingAsk {
  taskTitle: string;
  count: number;
}

interface CompleteSubtasksStore {
  pending: PendingAsk | null;
  resolver: ((includeSubtasks: boolean | null) => void) | null;
  /** Abre o diálogo e aguarda a escolha. true = concluir subtarefas, false = só a principal, null = cancelar. */
  ask: (ask: PendingAsk) => Promise<boolean | null>;
  resolve: (value: boolean | null) => void;
}

export const useCompleteSubtasksStore = create<CompleteSubtasksStore>((set, get) => ({
  pending: null,
  resolver: null,
  ask: (ask) =>
    new Promise<boolean | null>((resolve) => {
      set({ pending: ask, resolver: resolve });
    }),
  resolve: (value) => {
    const r = get().resolver;
    if (r) r(value);
    set({ pending: null, resolver: null });
  },
}));
