import { Plus } from 'lucide-react';
import { useQuickAddStore } from '@/store/quickAddStore';

export function MobileFab() {
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  return (
    <button
      onClick={() => openQuickAdd()}
      aria-label="Adicionar tarefa"
      className="lg:hidden fixed bottom-5 right-5 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40"
    >
      <Plus className="h-6 w-6" />
    </button>
  );
}
