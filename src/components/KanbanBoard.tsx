import { useMemo, useState } from 'react';
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
import { Plus, Flag, Calendar as CalendarIcon, Tag as TagIcon } from 'lucide-react';
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
  groupBy: GroupBy;
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
  /** Patch a aplicar à tarefa quando arrastada para esta coluna */
  patch: Partial<Task> & Record<string, any>;
  /** Defaults para nova tarefa criada nesta coluna */
  newTaskDefaults?: Record<string, any>;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'P1 — Urgente',
  2: 'P2 — Alta',
  3: 'P3 — Média',
  4: 'P4 — Baixa',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  1: 'hsl(var(--priority-1))',
  2: 'hsl(var(--priority-2))',
  3: 'hsl(var(--priority-3))',
  4: 'hsl(var(--muted-foreground))',
};

export function KanbanBoard({ tasks, groupBy, projectId, sections = [], newTaskDefaults }: KanbanBoardProps) {
  const projects = useTaskStore((s) => s.projects);
  const labels = useTaskStore((s) => s.labels);
  const updateTask = useTaskStore((s) => s.updateTask);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openTaskDetail = useTaskDetailStore((s) => s.open);

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { columns, getTaskColumnId } = useMemo(
    () => buildColumns(groupBy, { projects, labels, sections, projectId, newTaskDefaults }),
    [groupBy, projects, labels, sections, projectId, newTaskDefaults]
  );

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of columns) map.set(c.id, []);
    const otherCol = columns.find((c) => c.id === '__none__');
    for (const t of tasks) {
      const ids = getTaskColumnId(t);
      let placed = false;
      for (const id of ids) {
        const list = map.get(id);
        if (list) {
          list.push(t);
          placed = true;
        }
      }
      if (!placed && otherCol) map.get(otherCol.id)!.push(t);
    }
    return map;
  }, [tasks, columns, getTaskColumnId]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const colId = String(over.id);
    const col = columns.find((c) => c.id === colId);
    if (!col) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    // Evita update no-op: se a tarefa já pertence a essa coluna
    const currentCols = getTaskColumnId(task);
    if (currentCols.includes(colId)) return;
    await updateTask(taskId, col.patch as any);
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

// ---------------- Column builders ----------------

function buildColumns(
  groupBy: GroupBy,
  ctx: {
    projects: ReturnType<typeof useTaskStore.getState>['projects'];
    labels: ReturnType<typeof useTaskStore.getState>['labels'];
    sections: ReturnType<typeof useTaskStore.getState>['sections'];
    projectId?: string;
    newTaskDefaults?: Record<string, any>;
  }
): { columns: Column[]; getTaskColumnId: (t: Task) => string[] } {
  const { projects, labels, sections, projectId, newTaskDefaults } = ctx;

  if (groupBy === 'priority') {
    const cols: Column[] = ([1, 2, 3, 4] as Priority[]).map((p) => ({
      id: `priority-${p}`,
      title: PRIORITY_LABELS[p],
      color: PRIORITY_COLORS[p],
      patch: { priority: p },
      newTaskDefaults: { ...(newTaskDefaults || {}), priority: p },
    }));
    return {
      columns: cols,
      getTaskColumnId: (t) => [`priority-${t.priority}`],
    };
  }

  if (groupBy === 'section') {
    const projSections = sections
      .filter((s) => !projectId || s.projectId === projectId)
      .sort((a, b) => a.position - b.position);
    const cols: Column[] = [
      {
        id: '__none__',
        title: 'Sem seção',
        patch: { sectionId: null as any },
        newTaskDefaults: { ...(newTaskDefaults || {}), sectionId: null },
      },
      ...projSections.map<Column>((s) => ({
        id: `section-${s.id}`,
        title: s.name,
        patch: { sectionId: s.id as any },
        newTaskDefaults: { ...(newTaskDefaults || {}), sectionId: s.id },
      })),
    ];
    return {
      columns: cols,
      getTaskColumnId: (t) => [t.sectionId ? `section-${t.sectionId}` : '__none__'],
    };
  }

  if (groupBy === 'project') {
    const projs = projects.filter((p) => !p.archivedAt).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const cols: Column[] = projs.map((p) => ({
      id: `project-${p.id}`,
      title: p.isInbox ? 'Caixa de Entrada' : p.name,
      color: p.color,
      patch: { projectId: p.id, sectionId: null as any },
      newTaskDefaults: { ...(newTaskDefaults || {}), projectId: p.id },
    }));
    return {
      columns: cols,
      getTaskColumnId: (t) => (t.projectId ? [`project-${t.projectId}`] : []),
    };
  }

  if (groupBy === 'label') {
    const cols: Column[] = [
      {
        id: '__none__',
        title: 'Sem etiqueta',
        patch: { labels: [] as any },
        newTaskDefaults: { ...(newTaskDefaults || {}) },
      },
      ...labels.map<Column>((l) => ({
        id: `label-${l.id}`,
        title: l.name,
        color: l.color,
        // Substitui as etiquetas pela única dessa coluna (comportamento previsível)
        patch: { labels: [l.id] as any },
        newTaskDefaults: { ...(newTaskDefaults || {}), labels: [l.id] },
      })),
    ];
    return {
      columns: cols,
      getTaskColumnId: (t) => (t.labels.length ? t.labels.map((id) => `label-${id}`) : ['__none__']),
    };
  }

  if (groupBy === 'date') {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const cols: Column[] = [
      {
        id: 'overdue',
        title: 'Atrasada',
        color: 'hsl(var(--destructive))',
        patch: { dueDate: today as any },
        newTaskDefaults: { ...(newTaskDefaults || {}), defaultDate: today },
      },
      {
        id: 'today',
        title: 'Hoje',
        color: 'hsl(var(--primary))',
        patch: { dueDate: today as any },
        newTaskDefaults: { ...(newTaskDefaults || {}), defaultDate: today },
      },
      {
        id: 'tomorrow',
        title: 'Amanhã',
        patch: { dueDate: tomorrow as any },
        newTaskDefaults: { ...(newTaskDefaults || {}), defaultDate: tomorrow },
      },
      {
        id: 'upcoming',
        title: 'Em breve',
        patch: {},
        newTaskDefaults: { ...(newTaskDefaults || {}) },
      },
      {
        id: '__none__',
        title: 'Sem data',
        patch: { dueDate: null as any, dueTime: null as any },
        newTaskDefaults: { ...(newTaskDefaults || {}) },
      },
    ];
    return {
      columns: cols,
      getTaskColumnId: (t) => {
        if (!t.dueDate) return ['__none__'];
        if (t.dueDate < today) return ['overdue'];
        if (t.dueDate === today) return ['today'];
        if (t.dueDate === tomorrow) return ['tomorrow'];
        return ['upcoming'];
      },
    };
  }

  // status: completed vs not — apenas leitura útil
  const cols: Column[] = [
    {
      id: 'open',
      title: 'Em aberto',
      patch: { completed: false as any, completedAt: null as any },
      newTaskDefaults: { ...(newTaskDefaults || {}) },
    },
    {
      id: 'done',
      title: 'Concluída',
      patch: { completed: true as any, completedAt: new Date().toISOString() as any },
      newTaskDefaults: { ...(newTaskDefaults || {}) },
    },
  ];
  return {
    columns: cols,
    getTaskColumnId: (t) => [t.completed ? 'done' : 'open'],
  };
}
