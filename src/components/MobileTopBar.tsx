import { Menu } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { useLocation } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';

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

  // Find matching title (longest prefix match for nested routes)
  const title =
    ROUTE_TITLES[pathname] ||
    Object.entries(ROUTE_TITLES)
      .filter(([k]) => pathname.startsWith(k))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ||
    'TaskFlow';

  return (
    <header
      className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border pt-safe"
      role="banner"
    >
      <div className="h-12 px-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="h-10 w-10 flex items-center justify-center rounded-md text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="flex-1 font-display font-semibold text-base truncate">
          {title}
        </h1>

        <NotificationBell />
      </div>
    </header>
  );
}
