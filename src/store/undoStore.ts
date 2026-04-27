import { create } from 'zustand';

export type UndoAction = {
  label: string;
  undo: () => Promise<void> | void;
};

interface UndoState {
  stack: UndoAction[];
  push: (action: UndoAction) => void;
  pop: () => UndoAction | undefined;
  clear: () => void;
}

const MAX_HISTORY = 30;

export const useUndoStore = create<UndoState>()((set, get) => ({
  stack: [],
  push: (action) =>
    set((state) => {
      const next = [...state.stack, action];
      if (next.length > MAX_HISTORY) next.shift();
      return { stack: next };
    }),
  pop: () => {
    const stack = get().stack;
    if (stack.length === 0) return undefined;
    const action = stack[stack.length - 1];
    set({ stack: stack.slice(0, -1) });
    return action;
  },
  clear: () => set({ stack: [] }),
}));
