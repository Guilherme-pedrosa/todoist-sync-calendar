import { LayoutGrid, List as ListIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ViewMode, KanbanGroupBy } from '@/hooks/useViewPref';

interface ViewModeToolbarProps {
  mode: ViewMode;
  groupBy: KanbanGroupBy;
  onChangeMode: (m: ViewMode) => void;
  onChangeGroupBy: (g: KanbanGroupBy) => void;
  /** Quais opções de agrupamento mostrar (default: todas) */
  groupOptions?: KanbanGroupBy[];
}

export function ViewModeToolbar({
  mode,
  onChangeMode,
}: ViewModeToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-md border border-border bg-card overflow-hidden">
        <button
          onClick={() => onChangeMode('list')}
          className={cn(
            'px-2.5 h-8 text-xs flex items-center gap-1.5',
            mode === 'list'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          )}
          title="Lista"
        >
          <ListIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Lista</span>
        </button>
        <button
          onClick={() => onChangeMode('kanban')}
          className={cn(
            'px-2.5 h-8 text-xs flex items-center gap-1.5 border-l border-border',
            mode === 'kanban'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          )}
          title="Quadro Kanban"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Kanban</span>
        </button>
      </div>

    </div>
  );
}
