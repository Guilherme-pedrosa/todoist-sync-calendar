import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, CalendarRange, Search, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';

export function MobileBottomNav() {
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const taskDetailOpen = useTaskDetailStore((s) => !!s.taskId);
  const quickAddOpen = useQuickAddStore((s) => s.open);
  const openPalette = useCommandPaletteStore((s) => s.setOpen);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Hide when virtual keyboard is open (mobile)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const baseline = vv.height;
    const handler = () => {
      // 150px threshold = keyboard likely open
      setKeyboardOpen(baseline - vv.height > 150);
    };
    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  if (taskDetailOpen || quickAddOpen || keyboardOpen) return null;

  const itemClass = (active: boolean) =>
    cn(
      'flex flex-col items-center justify-center gap-1 flex-1 min-w-0 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors touch-manipulation select-none',
      'active:bg-muted/70',
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border pb-safe"
      aria-label="Navegação principal"
    >
      <div className="h-16 flex items-stretch justify-around">
        <NavLink to="/today" className={({ isActive }) => itemClass(isActive)}>
          <CalendarDays className="h-6 w-6" />
          <span>Hoje</span>
        </NavLink>
        <NavLink to="/upcoming" className={({ isActive }) => itemClass(isActive)}>
          <CalendarRange className="h-6 w-6" />
          <span>Agenda</span>
        </NavLink>
        {/* Spacer for centered FAB */}
        <div className="w-16 shrink-0" aria-hidden />
        <button className={itemClass(false)} onClick={() => openPalette(true)}>
          <Search className="h-6 w-6" />
          <span>Buscar</span>
        </button>
        <button className={itemClass(false)} onClick={toggleSidebar}>
          <Menu className="h-6 w-6" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
