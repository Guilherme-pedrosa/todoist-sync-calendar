import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, CalendarRange, Search, MessageSquare, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';

// Rotas onde o "+" não faz sentido (sem contexto de criação de tarefa).
const HIDDEN_ROUTES = ['/settings', '/team', '/profile', '/auth', '/login'];

export function MobileBottomNav() {
  const unreadByConversation = useChatStore((s) => s.unreadByConversation);
  const unreadCount = Object.values(unreadByConversation).reduce((total, count) => total + count, 0);
  const taskDetailOpen = useTaskDetailStore((s) => !!s.taskId);
  const quickAddOpen = useQuickAddStore((s) => s.open);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openPalette = useCommandPaletteStore((s) => s.setOpen);
  const paletteOpen = useCommandPaletteStore((s) => s.open);
  const { pathname } = useLocation();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Hide when virtual keyboard is open (mobile)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handler = () => {
      // Mede a área realmente coberta: uma altura inicial fixa confunde rotação com teclado.
      setKeyboardOpen(window.innerHeight - vv.height - vv.offsetTop > 150);
    };
    handler();
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    window.addEventListener('resize', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, []);

  if (taskDetailOpen || quickAddOpen || paletteOpen || keyboardOpen) return null;

  const showFab = !HIDDEN_ROUTES.some((r) => pathname.startsWith(r));

  const itemClass = (active: boolean) =>
    cn(
      'flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 px-1 py-1 rounded-xl text-[11px] font-semibold transition-colors touch-manipulation select-none',
      'active:bg-muted/70',
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-xl border-t border-border/70 pb-safe px-1 shadow-[0_-4px_20px_-12px_rgba(0,0,0,0.18)]"
      aria-label="Navegação principal"
    >
      <div className="h-14 flex items-stretch justify-around">
        <NavLink to="/today" className={({ isActive }) => itemClass(isActive)}>
          <CalendarDays className="h-5 w-5" />
          <span>Hoje</span>
        </NavLink>
        <NavLink to="/upcoming" className={({ isActive }) => itemClass(isActive)}>
          <CalendarRange className="h-5 w-5" />
          <span>Agenda</span>
        </NavLink>
        {/* "+" ancorado dentro da barra (ocupa o vão central) */}
        <div className="w-16 shrink-0 flex items-start justify-center">
          {showFab && (
            <button
              onClick={() => openQuickAdd()}
              aria-label="Adicionar tarefa"
              className="-mt-[14px] h-[52px] w-[52px] rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform ring-4 ring-background touch-manipulation"
            >
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>
        <button className={itemClass(false)} onClick={() => openPalette(true)}>
          <Search className="h-5 w-5" />
          <span>Buscar</span>
        </button>
        <NavLink to="/conversations" className={({ isActive }) => itemClass(isActive)} aria-label={unreadCount > 0 ? `Conversas, ${unreadCount} não lidas` : 'Conversas'}>
          <span className="relative">
            <MessageSquare className="h-5 w-5" />
            {unreadCount > 0 && <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />}
          </span>
          <span>Conversas</span>
        </NavLink>
      </div>
    </nav>
  );
}
