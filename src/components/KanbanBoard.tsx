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
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Task, Priority } from '@/types/task';
import { useTaskStore } from '@/store/taskStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCompleteTask } from '@/hooks/useCompleteTask';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Flag, Calendar as CalendarIcon, Tag as TagIcon, MoreHorizontal, Pencil, Trash2, Repeat } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User as UserIcon, UserMinus } from 'lucide-react';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type GroupBy = 'priority' | 'project' | 'label' | 'section' | 'date' | 'status' | 'assignee' | 'vehicle';

/** Extrai placa/modelo do veículo a partir da descrição da task.
 *  Aceita formatos como "Veículo: ABC1234 (Onix)" ou "Veiculo: ABC-1234". */
export function extractVehicle(task: Task): { plate: string; label: string } | null {
  const text = `${task.description || ''}\n${task.title || ''}`;
  const m = text.match(/Ve[ií]culo:\s*([A-Z0-9-]{4,10})(?:\s*\(([^)]+)\))?/i);
  if (!m) return null;
  const plate = m[1].toUpperCase().replace(/\s+/g, '');
  const model = m[2]?.trim();
  return { plate, label: model ? `${plate} · ${model}` : plate };
}

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
  /** Membro vinculado: tarefas que caem aqui serão atribuídas a ele */
  assigneeUserId?: string | null;
  assigneeName?: string | null;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  1: 'hsl(var(--priority-1))',
  2: 'hsl(var(--priority-2))',
  3: 'hsl(var(--priority-3))',
  4: 'hsl(var(--muted-foreground))',
};

interface ManualColumn {
  id: string;
  title: string;
  /** Se setado, tarefas que caem nessa coluna são reatribuídas a esse usuário */
  assigneeUserId?: string | null;
}

interface ManualKanbanState {
  storageKey: string;
  columns: ManualColumn[];
  taskColumns: Record<string, string>;
}

const DEFAULT_COLUMN: ManualColumn = { id: 'manual-default', title: 'Kanban' };
const RECURRING_COLUMN_ID = 'manual-recurring';
const RECURRING_COLUMN: ManualColumn = { id: RECURRING_COLUMN_ID, title: 'Recorrentes' };

function isRecurringTask(t: Task): boolean {
  return Boolean((t as any).recurrenceRule || (t as any).recurrence);
}

function ensureRecurringColumn(cols: ManualColumn[]): ManualColumn[] {
  if (cols.some((c) => c.id === RECURRING_COLUMN_ID)) return cols;
  return [...cols, RECURRING_COLUMN];
}

function getKanbanStorageKey(boardKey?: string) {
  return `taskflow.kanban.manual.${boardKey || 'default'}`;
}

function readManualKanban(storageKey: string): Omit<ManualKanbanState, 'storageKey'> {
  if (typeof window === 'undefined') return { columns: ensureRecurringColumn([DEFAULT_COLUMN]), taskColumns: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    const rawColumns = Array.isArray(parsed.columns) && parsed.columns.length > 0 ? parsed.columns : [DEFAULT_COLUMN];
    const columns = ensureRecurringColumn(
      rawColumns.map((c: any) => ({
        id: String(c.id),
        title: String(c.title || 'Kanban'),
        assigneeUserId: c.assigneeUserId ?? null,
      }))
    );
    return {
      columns,
      taskColumns: parsed.taskColumns && typeof parsed.taskColumns === 'object' ? parsed.taskColumns : {},
    };
  } catch {
    return { columns: ensureRecurringColumn([DEFAULT_COLUMN]), taskColumns: {} };
  }
}

function writeManualKanban(storageKey: string, board: ManualKanbanState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify({ columns: board.columns, taskColumns: board.taskColumns }));
}

export function KanbanBoard({ tasks, boardKey, newTaskDefaults, groupBy, projectId }: KanbanBoardProps) {
  if (groupBy === 'assignee') {
    return <AssigneeKanban tasks={tasks} projectId={projectId} newTaskDefaults={newTaskDefaults} />;
  }
  if (groupBy === 'vehicle') {
    return <VehicleKanban tasks={tasks} projectId={projectId} newTaskDefaults={newTaskDefaults} />;
  }
  return <ManualKanban tasks={tasks} boardKey={boardKey} newTaskDefaults={newTaskDefaults} />;
}

function ManualKanban({ tasks, boardKey, newTaskDefaults }: KanbanBoardProps) {
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openTaskDetail = useTaskDetailStore((s) => s.open);
  const members = useWorkspaceStore((s) => s.members);
  const { user } = useAuth();

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
    () =>
      board.columns.map((col) => {
        const member = col.assigneeUserId ? members.find((m) => m.userId === col.assigneeUserId) : null;
        return {
          ...col,
          assigneeName: member ? (member.displayName || member.email || 'Membro') : null,
          newTaskDefaults: {
            ...(newTaskDefaults || {}),
            ...(col.assigneeUserId ? { assigneeIds: [col.assigneeUserId] } : {}),
          },
        };
      }),
    [board.columns, newTaskDefaults, members]
  );

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of columns) map.set(c.id, []);
    const firstNonRecurring = columns.find((c) => c.id !== RECURRING_COLUMN_ID) || columns[0];
    const validIds = new Set(columns.map((c) => c.id));
    for (const t of tasks) {
      // Recurring tasks always go to the recurring column
      if (isRecurringTask(t) && map.has(RECURRING_COLUMN_ID)) {
        map.get(RECURRING_COLUMN_ID)!.push(t);
        continue;
      }
      const colId = board.taskColumns[t.id];
      let targetId = colId && validIds.has(colId) ? colId : firstNonRecurring?.id;
      // Don't allow non-recurring tasks pinned to recurring column
      if (targetId === RECURRING_COLUMN_ID && !isRecurringTask(t)) {
        targetId = firstNonRecurring?.id;
      }
      if (targetId) map.get(targetId)!.push(t);
    }
    return map;
  }, [tasks, columns, board.taskColumns]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Column reorder: ids prefixed with "col:"
    if (activeId.startsWith('col:') && overId.startsWith('col:')) {
      const fromId = activeId.slice(4);
      const toId = overId.slice(4);
      setBoard((current) => {
        const oldIndex = current.columns.findIndex((c) => c.id === fromId);
        const newIndex = current.columns.findIndex((c) => c.id === toId);
        if (oldIndex < 0 || newIndex < 0) return current;
        return { ...current, columns: arrayMove(current.columns, oldIndex, newIndex) };
      });
      return;
    }

    // Task move
    const taskId = activeId;
    const colId = overId;
    const col = columns.find((c) => c.id === colId);
    if (!col) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    // Block dropping non-recurring tasks into the recurring column (and vice versa)
    if (colId === RECURRING_COLUMN_ID && !isRecurringTask(task)) return;
    if (colId !== RECURRING_COLUMN_ID && isRecurringTask(task)) return;
    if (board.taskColumns[taskId] === colId) {
      // mesma coluna, nada a fazer
    } else {
      setBoard((current) => ({
        ...current,
        taskColumns: { ...current.taskColumns, [taskId]: colId },
      }));
    }

    // Se a coluna está vinculada a um responsável, reatribuir a tarefa
    if (col.assigneeUserId) {
      void reassignTaskToUser(taskId, col.assigneeUserId);
    }
  };

  const reassignTaskToUser = async (taskId: string, targetUserId: string) => {
    const t = useTaskStore.getState().tasks.find((x) => x.id === taskId);
    if (!t) return;
    const current = t.assigneeIds || [];
    if (current.length === 1 && current[0] === targetUserId) return;
    const prev = current;
    const next = [targetUserId];
    useTaskStore.setState((state: any) => ({
      tasks: state.tasks.map((x: Task) => (x.id === taskId ? { ...x, assigneeIds: next } : x)),
    }));
    try {
      await supabase.from('task_assignees').delete().eq('task_id', taskId);
      if (user) {
        await supabase
          .from('task_assignees')
          .insert([{ task_id: taskId, user_id: targetUserId, assigned_by: user.id }]);
      }
    } catch (err) {
      console.error('Falha ao reatribuir tarefa', err);
      toast.error('Não foi possível reatribuir a tarefa');
      useTaskStore.setState((state: any) => ({
        tasks: state.tasks.map((x: Task) => (x.id === taskId ? { ...x, assigneeIds: prev } : x)),
      }));
    }
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

  const setColumnAssignee = (colId: string, userId: string | null) => {
    setBoard((current) => ({
      ...current,
      columns: current.columns.map((c) => (c.id === colId ? { ...c, assigneeUserId: userId } : c)),
    }));
    if (userId) {
      // Reatribuir todas as tarefas atualmente nessa coluna
      const taskIds = Object.entries(board.taskColumns)
        .filter(([, cid]) => cid === colId)
        .map(([tid]) => tid);
      // incluir também as tarefas que caem aqui por fallback (primeira coluna)
      const tasksInCol = (tasksByColumn.get(colId) || []).map((t) => t.id);
      const allIds = Array.from(new Set([...taskIds, ...tasksInCol]));
      for (const tid of allIds) void reassignTaskToUser(tid, userId);
    }
  };

  const deleteColumn = (colId: string) => {
    if (colId === RECURRING_COLUMN_ID) return; // recurring column is permanent
    setBoard((current) => {
      if (current.columns.length <= 1) return current;
      const remaining = current.columns.filter((c) => c.id !== colId);
      const fallbackId = remaining.find((c) => c.id !== RECURRING_COLUMN_ID)?.id || remaining[0].id;
      const newTaskColumns: Record<string, string> = { ...current.taskColumns };
      for (const [tid, cid] of Object.entries(newTaskColumns)) {
        if (cid === colId) newTaskColumns[tid] = fallbackId;
      }
      return { ...current, columns: remaining, taskColumns: newTaskColumns };
    });
  };

  const sortableColumnIds = useMemo(() => columns.map((c) => `col:${c.id}`), [columns]);

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
          <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn.get(col.id) || []}
                canDelete={col.id !== RECURRING_COLUMN_ID && columns.length > 1}
                isRecurringColumn={col.id === RECURRING_COLUMN_ID}
                onAddTask={() => {
                  openQuickAdd({
                    ...(newTaskDefaults || {}),
                    ...(col.newTaskDefaults || {}),
                  } as any);
                }}
                onOpenTask={(id) => openTaskDetail(id)}
                onRename={(title) => renameColumn(col.id, title)}
                onDelete={() => deleteColumn(col.id)}
                members={col.id === RECURRING_COLUMN_ID ? [] : members}
                onSetAssignee={col.id === RECURRING_COLUMN_ID ? undefined : (uid) => setColumnAssignee(col.id, uid)}
              />
            ))}
          </SortableContext>
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

// ---------------- Assignee Kanban (auto by responsible person) ----------------

const UNASSIGNED_COLUMN_ID = 'assignee-none';

function AssigneeKanban({ tasks, projectId, newTaskDefaults }: { tasks: Task[]; projectId?: string; newTaskDefaults?: KanbanBoardProps['newTaskDefaults'] }) {
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openTaskDetail = useTaskDetailStore((s) => s.open);
  const members = useWorkspaceStore((s) => s.members);
  const { user } = useAuth();
  const tasksFromStore = useTaskStore((s) => s.tasks);

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columns = useMemo(() => {
    const cols = members.map((m) => ({
      id: `assignee:${m.userId}`,
      userId: m.userId,
      title: (m.displayName || m.email || 'Membro').toString(),
    }));
    cols.push({ id: UNASSIGNED_COLUMN_ID, userId: '', title: 'Sem responsável' });
    return cols;
  }, [members]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of columns) map.set(c.id, []);
    for (const t of tasks) {
      const ids = (t.assigneeIds || []).filter(Boolean);
      if (ids.length === 0) {
        map.get(UNASSIGNED_COLUMN_ID)!.push(t);
        continue;
      }
      let placed = false;
      for (const uid of ids) {
        const col = map.get(`assignee:${uid}`);
        if (col) {
          col.push(t);
          placed = true;
        }
      }
      if (!placed) map.get(UNASSIGNED_COLUMN_ID)!.push(t);
    }
    return map;
  }, [tasks, columns]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const reassignTask = async (taskId: string, targetUserId: string | null) => {
    const task = tasksFromStore.find((t) => t.id === taskId);
    if (!task) return;
    const prev = task.assigneeIds || [];
    const next = targetUserId ? [targetUserId] : [];
    if (prev.length === next.length && prev.every((id, i) => id === next[i])) return;

    useTaskStore.setState((state: any) => ({
      tasks: state.tasks.map((t: Task) => (t.id === taskId ? { ...t, assigneeIds: next } : t)),
    }));

    try {
      await supabase.from('task_assignees').delete().eq('task_id', taskId);
      if (next.length > 0 && user) {
        await supabase
          .from('task_assignees')
          .insert(next.map((uid) => ({ task_id: taskId, user_id: uid, assigned_by: user.id })));
      }
    } catch (err) {
      console.error('Failed to reassign task', err);
      toast.error('Não foi possível reatribuir a tarefa');
      useTaskStore.setState((state: any) => ({
        tasks: state.tasks.map((t: Task) => (t.id === taskId ? { ...t, assigneeIds: prev } : t)),
      }));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    const col = columns.find((c) => c.id === overId);
    if (!col) return;
    const targetUserId = col.id === UNASSIGNED_COLUMN_ID ? null : col.userId;
    void reassignTask(taskId, targetUserId);
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
            <AssigneeColumn
              key={col.id}
              id={col.id}
              title={col.title}
              tasks={tasksByColumn.get(col.id) || []}
              onAddTask={() => {
                openQuickAdd({
                  ...(newTaskDefaults || {}),
                  ...(projectId ? { projectId } : {}),
                  ...(col.userId ? { assigneeIds: [col.userId] } : {}),
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

function AssigneeColumn({
  id,
  title,
  tasks,
  onAddTask,
  onOpenTask,
}: {
  id: string;
  title: string;
  tasks: Task[];
  onAddTask: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col bg-muted/30 rounded-lg border border-border/50 max-h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider truncate" title={title}>
            {title}
          </h3>
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

// ---------------- Column ----------------

function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onOpenTask,
  onRename,
  onDelete,
  canDelete,
  isRecurringColumn,
  members,
  onSetAssignee,
}: {
  column: Column;
  tasks: Task[];
  onAddTask: () => void;
  onOpenTask: (id: string) => void;
  onRename?: (title: string) => void;
  onDelete?: () => void;
  canDelete?: boolean;
  isRecurringColumn?: boolean;
  members?: { userId: string; displayName: string | null; email: string | null }[];
  onSetAssignee?: (userId: string | null) => void;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: column.id });
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `col:${column.id}` });
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(column.title);

  useEffect(() => {
    setDraftTitle(column.title);
  }, [column.title]);

  const commitRename = () => {
    const cleaned = draftTitle.trim();
    if (cleaned && cleaned !== column.title) onRename?.(cleaned);
    else setDraftTitle(column.title);
    setIsRenaming(false);
  };

  const sortStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  return (
    <div
      ref={setSortRef}
      style={sortStyle}
      className="w-[280px] flex-shrink-0 flex flex-col bg-muted/30 rounded-lg border border-border/50 max-h-full"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            {...attributes}
            {...listeners}
            className="p-0.5 -ml-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
            aria-label="Arrastar coluna"
            title="Arrastar para reordenar"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {column.color && (
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
          )}
          {isRenaming ? (
            <Input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setDraftTitle(column.title);
                  setIsRenaming(false);
                }
              }}
              className="h-6 text-xs font-semibold uppercase tracking-wider px-1.5"
            />
          ) : (
            <h3
              className="text-xs font-semibold uppercase tracking-wider truncate cursor-text hover:text-foreground"
              onDoubleClick={() => onRename && setIsRenaming(true)}
              title={onRename ? 'Duplo clique para renomear' : undefined}
            >
              {column.title}
            </h3>
          )}
          <span className="text-[10px] text-muted-foreground">{tasks.length}</span>
          {column.assigneeUserId && column.assigneeName && (
            <span
              className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium max-w-[110px] truncate"
              title={`Vinculada a ${column.assigneeName}`}
            >
              <UserIcon className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{column.assigneeName}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onAddTask}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Adicionar tarefa"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {(onRename || onDelete || onSetAssignee) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Opções da coluna"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {onRename && (
                  <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Renomear
                  </DropdownMenuItem>
                )}
                {onDelete && canDelete && (
                  <DropdownMenuItem
                    onClick={() => {
                      if (confirm(`Excluir coluna "${column.title}"? As tarefas serão movidas para a primeira coluna.`)) {
                        onDelete();
                      }
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                )}
                {onSetAssignee && members && members.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Vincular a responsável
                    </DropdownMenuLabel>
                    <div className="max-h-56 overflow-y-auto">
                      {members.map((m) => {
                        const isSelected = column.assigneeUserId === m.userId;
                        const label = m.displayName || m.email || 'Membro';
                        return (
                          <DropdownMenuItem
                            key={m.userId}
                            onClick={() => onSetAssignee(isSelected ? null : m.userId)}
                          >
                            <UserIcon className="h-3.5 w-3.5 mr-2" />
                            <span className="truncate">{label}</span>
                            {isSelected && <span className="ml-auto text-primary text-xs">✓</span>}
                          </DropdownMenuItem>
                        );
                      })}
                    </div>
                    {column.assigneeUserId && (
                      <DropdownMenuItem onClick={() => onSetAssignee(null)}>
                        <UserMinus className="h-3.5 w-3.5 mr-2" />
                        Remover vínculo
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div
        ref={setDropRef}
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
                {(task.recurrenceRule || task.recurrence) && (
                  <Repeat className="h-3 w-3 text-sky-500" aria-label="Tarefa recorrente" />
                )}
              </span>
            )}
            {!dueLabel && (task.recurrenceRule || task.recurrence) && (
              <span className="inline-flex items-center gap-1 text-sky-500">
                <Repeat className="h-3 w-3" />
                Recorrente
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


// ============================================================
// Vehicle Kanban — uma coluna por veículo (placa + modelo)
// Detecta veículo a partir do padrão "Veículo: PLACA (Modelo)" na descrição.
// ============================================================
const VEHICLE_UNKNOWN_ID = 'vehicle-none';

function VehicleKanban({
  tasks,
  projectId,
  newTaskDefaults,
}: {
  tasks: Task[];
  projectId?: string;
  newTaskDefaults?: KanbanBoardProps['newTaskDefaults'];
}) {
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openTaskDetail = useTaskDetailStore((s) => s.open);

  const { columns, tasksByColumn } = useMemo(() => {
    const map = new Map<string, { id: string; title: string; plate: string | null; tasks: Task[] }>();
    for (const t of tasks) {
      if (t.completed) continue;
      const v = extractVehicle(t);
      const id = v ? `vehicle:${v.plate}` : VEHICLE_UNKNOWN_ID;
      const title = v ? v.label : 'Sem veículo';
      const plate = v ? v.plate : null;
      if (!map.has(id)) map.set(id, { id, title, plate, tasks: [] });
      map.get(id)!.tasks.push(t);
    }

    const cols = Array.from(map.values()).sort((a, b) => {
      if (a.id === VEHICLE_UNKNOWN_ID) return 1;
      if (b.id === VEHICLE_UNKNOWN_ID) return -1;
      return a.title.localeCompare(b.title);
    });

    const byCol = new Map<string, Task[]>();
    for (const c of cols) byCol.set(c.id, c.tasks);
    return { columns: cols, tasksByColumn: byCol };
  }, [tasks]);

  if (columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Nenhuma tarefa em aberto. Adicione descrição no formato "Veículo: PLACA (Modelo)" para agrupar.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
      <div className="flex gap-3 px-3 sm:px-6 py-4 h-full min-w-max">
        {columns.map((col) => (
          <AssigneeColumn
            key={col.id}
            id={col.id}
            title={col.title}
            tasks={tasksByColumn.get(col.id) || []}
            onAddTask={() => {
              openQuickAdd({
                ...(newTaskDefaults || {}),
                ...(projectId ? { projectId } : {}),
                ...(col.plate
                  ? { description: `Veículo: ${col.plate}\n` }
                  : {}),
              } as any);
            }}
            onOpenTask={(id) => openTaskDetail(id)}
          />
        ))}
      </div>
    </div>
  );
}
