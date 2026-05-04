import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Task, Priority } from '@/types/task';
import { useTaskStore } from '@/store/taskStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCompleteTask } from '@/hooks/useCompleteTask';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Flag, Calendar as CalendarIcon, Tag as TagIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type GroupBy = 'priority' | 'project' | 'label' | 'section' | 'date' | 'status';

export interface KanbanSection {
  id: string;
  name: string;
  position: number;
  projectId: string;
}

interface KanbanBoardProps {
  tasks: Task[];
  groupBy?: GroupBy;
  /** Identifica o quadro manual de cada página/visão */
  boardKey?: string;
  /** Para projetos: limita seções/colunas a este projeto */
  projectId?: string;
  /** Seções disponíveis (necessário quando groupBy='section') */
  sections?: KanbanSection[];
  /** defaults aplicados ao criar nova tarefa numa coluna (ex.: defaultDate em "Hoje") */
  newTaskDefaults?: Partial<{ projectId: string; sectionId: string; defaultDate: string }>;
}

interface Column {
  id: string;
  title: string;
  color?: string;
  /** Defaults para nova tarefa criada nesta coluna */
  newTaskDefaults?: Record<string, any>;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  1: 'hsl(var(--priority-1))',
  2: 'hsl(var(--priority-2))',
  3: 'hsl(var(--priority-3))',
  4: 'hsl(var(--muted-foreground))',
};

interface ManualKanbanState {
  storageKey: string;
  columns: Pick<Column, 'id' | 'title'>[];
  taskColumns: Record<string, string>;
}

const DEFAULT_COLUMN: Pick<Column, 'id' | 'title'> = { id: 'manual-default', title: 'Kanban' };

function getKanbanStorageKey(boardKey?: string) {
  return `taskflow.kanban.manual.${boardKey || 'default'}`;
}

function readManualKanban(storageKey: string): Omit<ManualKanbanState, 'storageKey'> {
  if (typeof window === 'undefined') return { columns: [DEFAULT_COLUMN], taskColumns: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    const columns = Array.isArray(parsed.columns) && parsed.columns.length > 0 ? parsed.columns : [DEFAULT_COLUMN];
    return {
      columns: columns.map((c: any) => ({ id: String(c.id), title: String(c.title || 'Kanban') })),
      taskColumns: parsed.taskColumns && typeof parsed.taskColumns === 'object' ? parsed.taskColumns : {},
    };
  } catch {
    return { columns: [DEFAULT_COLUMN], taskColumns: {} };
  }
}

function writeManualKanban(storageKey: string, board: ManualKanbanState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify({ columns: board.columns, taskColumns: board.taskColumns }));
}

export function KanbanBoard({ tasks, boardKey, newTaskDefaults }: KanbanBoardProps) {
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openTaskDetail = useTaskDetailStore((s) => s.open);

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const storageKey = getKanbanStorageKey(boardKey);
  const [board, setBoard] = useState<ManualKanbanState>(() => ({
    storageKey,
    ...readManualKanban(storageKey),
  }));

  useEffect(() => {
    setBoard({ storageKey, ...readManualKanban(storageKey) });
  }, [storageKey]);

  useEffect(() => {
    if (board.storageKey !== storageKey) return;
    writeManualKanban(storageKey, board);
  }, [board, storageKey]);

  const columns = useMemo<Column[]>(
    () => board.columns.map((col) => ({ ...col, newTaskDefaults: { ...(newTaskDefaults || {}) } })),
    [board.columns, newTaskDefaults]
  );

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of columns) map.set(c.id, []);
    const firstCol = columns[0];
    const validIds = new Set(columns.map((c) => c.id));
    for (const t of tasks) {
      const colId = board.taskColumns[t.id];
      const targetId = colId && validIds.has(colId) ? colId : firstCol?.id;
      if (targetId) map.get(targetId)!.push(t);
    }
    return map;
  }, [tasks, columns, board.taskColumns]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const colId = String(over.id);
    const col = columns.find((c) => c.id === colId);
    if (!col) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (board.taskColumns[taskId] === colId) return;
    setBoard((current) => ({
      ...current,
      taskColumns: { ...current.taskColumns, [taskId]: colId },
    }));
  };

  const addColumn = (title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setBoard((current) => ({
      ...current,
      columns: [...current.columns, { id: `manual-${Date.now()}`, title: cleanTitle }],
    }));
  };

  const renameColumn = (colId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setBoard((current) => ({
      ...current,
      columns: current.columns.map((c) => (c.id === colId ? { ...c, title: cleanTitle } : c)),
    }));
  };

  const deleteColumn = (colId: string) => {
    setBoard((current) => {
      if (current.columns.length <= 1) return current;
      const remaining = current.columns.filter((c) => c.id !== colId);
      const fallbackId = remaining[0].id;
      const newTaskColumns: Record<string, string> = { ...current.taskColumns };
      for (const [tid, cid] of Object.entries(newTaskColumns)) {
        if (cid === colId) newTaskColumns[tid] = fallbackId;
      }
      return { ...current, columns: remaining, taskColumns: newTaskColumns };
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
        <div className="flex gap-3 px-3 sm:px-6 py-4 h-full min-w-max">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasksByColumn.get(col.id) || []}
              onAddTask={() => {
                openQuickAdd({
                  ...(newTaskDefaults || {}),
                  ...(col.newTaskDefaults || {}),
                } as any);
              }}
              onOpenTask={(id) => openTaskDetail(id)}
            />
          ))}
          <AddKanbanColumn onAdd={addColumn} />
        </div>
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rounded-md border border-border bg-card shadow-lg px-3 py-2 text-sm w-[260px]">
            {activeTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------- Column ----------------

function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onOpenTask,
}: {
  column: Column;
  tasks: Task[];
  onAddTask: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });
  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col bg-muted/30 rounded-lg border border-border/50 max-h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          {column.color && (
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
          )}
          <h3 className="text-xs font-semibold uppercase tracking-wider truncate">{column.title}</h3>
          <span className="text-[10px] text-muted-foreground">{tasks.length}</span>
        </div>
        <button
          onClick={onAddTask}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          aria-label="Adicionar tarefa"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto scrollbar-thin px-2 py-2 space-y-1.5 min-h-[120px]',
          isOver && 'bg-primary/5 ring-2 ring-primary/30 rounded-b-lg'
        )}
      >
        {tasks.map((task) => (
          <KanbanCard key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
        ))}
        {tasks.length === 0 && (
          <div className="text-[11px] text-muted-foreground/60 text-center py-4">Vazio</div>
        )}
      </div>
    </div>
  );
}

function AddKanbanColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');

  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    onAdd(cleanTitle);
    setTitle('');
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="w-[280px] h-10 flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Criar coluna
      </button>
    );
  }

  return (
    <div className="w-[280px] flex-shrink-0 rounded-lg border border-border/50 bg-muted/30 p-2 space-y-2 h-fit">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setTitle('');
            setIsEditing(false);
          }
        }}
        placeholder="Nome da coluna"
        className="h-8 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-8" onClick={submit}>
          Criar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => {
            setTitle('');
            setIsEditing(false);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ---------------- Card ----------------

function KanbanCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const projects = useTaskStore((s) => s.projects);
  const allLabels = useTaskStore((s) => s.labels);
  const completeTask = useCompleteTask();
  const project = projects.find((p) => p.id === task.projectId);
  const taskLabels = allLabels.filter((l) => task.labels.includes(l.id));

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const dueLabel = (() => {
    if (!task.dueDate) return null;
    const d = parseISO(task.dueDate);
    if (isToday(d)) return 'Hoje';
    if (isPast(d)) return format(d, "d 'de' MMM", { locale: ptBR });
    return format(d, "d 'de' MMM", { locale: ptBR });
  })();
  const dueIsOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-md bg-card border border-border/60 px-2.5 py-2 text-sm shadow-sm hover:shadow-md hover:border-border cursor-grab active:cursor-grabbing select-none',
        isDragging && 'opacity-40'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            completeTask(task.id);
          }}
          className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-[1.5px] shrink-0 flex items-center justify-center hover:bg-muted',
            task.priority === 1 && 'border-priority-1',
            task.priority === 2 && 'border-priority-2',
            task.priority === 3 && 'border-priority-3',
            task.priority === 4 && 'border-muted-foreground/40'
          )}
          aria-label="Concluir"
        />
        <div
          className="flex-1 min-w-0"
          {...listeners}
          {...attributes}
        >
          <div className="text-[13px] font-medium leading-snug break-words">{task.title}</div>
          {task.description && (
            <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{task.description}</div>
          )}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-[10px] text-muted-foreground">
            {dueLabel && (
              <span className={cn('inline-flex items-center gap-1', dueIsOverdue && 'text-destructive')}>
                <CalendarIcon className="h-3 w-3" />
                {dueLabel}
                {task.dueTime && ` ${task.dueTime}`}
              </span>
            )}
            {project && !project.isInbox && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                {project.name}
              </span>
            )}
            {taskLabels.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1">
                <TagIcon className="h-3 w-3" style={{ color: l.color }} />
                {l.name}
              </span>
            ))}
            {task.priority < 4 && (
              <span className="inline-flex items-center gap-1">
                <Flag className="h-3 w-3" style={{ color: PRIORITY_COLORS[task.priority] }} />
                P{task.priority}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

