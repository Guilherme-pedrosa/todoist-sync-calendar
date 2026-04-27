import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
