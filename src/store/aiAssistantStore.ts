import { create } from 'zustand';

interface AIAssistantState {
  isOpen: boolean;
  initialTab: 'chat' | 'analyze' | 'organize';
  open: (tab?: 'chat' | 'analyze' | 'organize') => void;
  close: () => void;
}

export const useAIAssistantStore = create<AIAssistantState>()((set) => ({
  isOpen: false,
  initialTab: 'analyze',
  open: (tab = 'analyze') => set({ isOpen: true, initialTab: tab }),
  close: () => set({ isOpen: false }),
}));
