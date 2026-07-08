import { Plus } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQuickAddStore } from '@/store/quickAddStore';

// Routes where the floating "+" doesn't make sense (no task creation context).
const HIDDEN_ROUTES = [
  '/settings',
  '/team',
  '/profile',
  '/auth',
  '/login',
];

export function MobileFab() {
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const { pathname } = useLocation();

  if (HIDDEN_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <button
      onClick={() => openQuickAdd()}
      aria-label="Adicionar tarefa"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)' }}
      className="lg:hidden fixed left-1/2 -translate-x-1/2 h-16 w-16 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform z-40 ring-4 ring-background touch-manipulation"
    >
      <Plus className="h-7 w-7" />
    </button>
  );
}
