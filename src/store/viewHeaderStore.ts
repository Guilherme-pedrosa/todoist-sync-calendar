import { create } from 'zustand';

interface ViewHeaderState {
  /** Quantidade de tarefas visíveis na lista atual (null = rota não é lista). */
  taskCount: number | null;
  /** Quantidade de tarefas concluídas disponíveis para o toggle. */
  completedCount: number;
  /** Se a view atual suporta o toggle de concluídas. */
  supportsCompletedToggle: boolean;
  showCompleted: boolean;
  /** Alterna o "mostrar concluídas" da lista atual. */
  toggleCompleted: (() => void) | null;
  /** Topbar recolhida (scroll para baixo). */
  headerHidden: boolean;

  setHeader: (
    data: Partial<Omit<ViewHeaderState, 'setHeader' | 'clearHeader' | 'setHeaderHidden'>>
  ) => void;
  clearHeader: () => void;
  setHeaderHidden: (hidden: boolean) => void;
}

export const useViewHeaderStore = create<ViewHeaderState>((set, get) => ({
  taskCount: null,
  completedCount: 0,
  supportsCompletedToggle: false,
  showCompleted: false,
  toggleCompleted: null,
  headerHidden: false,

  setHeader: (data) => set(data as any),
  clearHeader: () =>
    set({
      taskCount: null,
      completedCount: 0,
      supportsCompletedToggle: false,
      showCompleted: false,
      toggleCompleted: null,
      headerHidden: false,
    }),
  setHeaderHidden: (hidden) => {
    if (get().headerHidden !== hidden) set({ headerHidden: hidden });
  },
}));
