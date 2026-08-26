import { Menu } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { useLocation } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';
import { ShowCompletedToggle } from '@/components/ShowCompletedToggle';
import { useViewHeaderStore } from '@/store/viewHeaderStore';

const ROUTE_TITLES: Record<string, string> = {
  '/today': 'Hoje',
  '/inbox': 'Caixa de Entrada',
  '/upcoming': 'Agenda',
  '/completed': 'Concluídas',
  '/labels': 'Etiquetas',
  '/filters': 'Filtros',
  '/settings': 'Configurações',
  '/team/members': 'Membros',
  '/team/teams': 'Times',
  '/team/projects': 'Projetos da equipe',
  '/team/workload': 'Carga de trabalho',
  '/conversations': 'Conversas',
  '/transkriptor': 'Transkriptor',
};

export function MobileTopBar() {
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const { pathname } = useLocation();

  const taskCount = useViewHeaderStore((s) => s.taskCount);
  const completedCount = useViewHeaderStore((s) => s.completedCount);
  const supportsCompletedToggle = useViewHeaderStore((s) => s.supportsCompletedToggle);
  const showCompleted = useViewHeaderStore((s) => s.showCompleted);
  const toggleCompleted = useViewHeaderStore((s) => s.toggleCompleted);
  const headerHidden = useViewHeaderStore((s) => s.headerHidden);

  // Find matching title (longest prefix match for nested routes)
  const title =
    ROUTE_TITLES[pathname] ||
    Object.entries(ROUTE_TITLES)
      .filter(([k]) => pathname.startsWith(k))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ||
    'TaskFlow';

  return (
    <header
      className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/70 pt-safe transition-transform duration-200 ease-out"
      style={{
        willChange: 'transform',
        transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)',
      }}
      role="banner"
    >
      <div className="h-[52px] px-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="flex-1 min-w-0 font-display font-semibold text-base truncate flex items-baseline gap-1.5">
          <span className="truncate">{title}</span>
          {typeof taskCount === 'number' && (
            <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
              {taskCount}
            </span>
          )}
        </h1>

        {supportsCompletedToggle && toggleCompleted && (
          <ShowCompletedToggle
            show={showCompleted}
            onChange={() => toggleCompleted()}
            count={completedCount}
            className="px-2"
          />
        )}

        <NotificationBell />
      </div>
    </header>
  );
}
