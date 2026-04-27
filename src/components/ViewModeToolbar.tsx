import { LayoutGrid, List as ListIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ViewMode, KanbanGroupBy } from '@/hooks/useViewPref';

interface ViewModeToolbarProps {
  mode: ViewMode;
  groupBy: KanbanGroupBy;
  onChangeMode: (m: ViewMode) => void;
  onChangeGroupBy: (g: KanbanGroupBy) => void;
  /** Quais opções de agrupamento mostrar (default: todas) */
  groupOptions?: KanbanGroupBy[];
}

const GROUP_LABELS: Record<KanbanGroupBy, string> = {
  priority: 'Prioridade',
  project: 'Projeto',
  label: 'Etiqueta',
  section: 'Seção',
  date: 'Data',
  status: 'Status',
};

export function ViewModeToolbar({
  mode,
  groupBy,
  onChangeMode,
  onChangeGroupBy,
  groupOptions = ['priority', 'date', 'label', 'project', 'status'],
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

      {mode === 'kanban' && (
        <Select value={groupBy} onValueChange={(v) => onChangeGroupBy(v as KanbanGroupBy)}>
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupOptions.map((g) => (
              <SelectItem key={g} value={g} className="text-xs">
                Agrupar: {GROUP_LABELS[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
