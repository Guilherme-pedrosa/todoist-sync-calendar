import { Plus } from 'lucide-react';
import { useQuickAddStore } from '@/store/quickAddStore';

export function MobileFab() {
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  return (
    <button
      onClick={() => openQuickAdd()}
      aria-label="Adicionar tarefa"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 12px)' }}
      className="lg:hidden fixed left-1/2 -translate-x-1/2 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40 ring-4 ring-background"
    >
      <Plus className="h-6 w-6" />
    </button>
  );
}
