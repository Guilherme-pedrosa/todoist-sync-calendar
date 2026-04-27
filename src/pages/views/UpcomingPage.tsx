import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { Task } from '@/types/task';
import { TaskItem } from '@/components/TaskItem';
import { AddTaskForm } from '@/components/AddTaskForm';
import {
  CalendarRange,
  Menu,
  ChevronLeft,
  ChevronRight,
  List as ListIcon,
  CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type Mode = 'list' | 'week';

const HOUR_HEIGHT = 48; // px por hora
const MIN_TASK_MINUTES = 15;
const SNAP_MINUTES = 15;
const DEFAULT_DURATION = 60;

export default function UpcomingPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const [mode, setMode] = useState<Mode>('week');
  const [weekOffset, setWeekOffset] = useState(0);

  const upcoming = useMemo(
    () =>
      tasks.filter(
        (t) => !t.completed && !t.parentId && t.dueDate && t.dueDate >= new Date().toISOString().slice(0, 10)
      ),
    [tasks]
  );

  const weekStart = useMemo(
    () => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset),
    [weekOffset]
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of upcoming) {
      const k = t.dueDate!;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return map;
  }, [upcoming]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 -ml-1 rounded-md hover:bg-muted transition-colors shrink-0"
          aria-label="Alternar barra lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <CalendarRange className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">Em breve</h2>
          <p className="text-[11px] sm:text-xs text-muted-foreground capitalize truncate">
            {format(weekStart, "d 'de' MMM", { locale: ptBR })} —{' '}
            {format(addDays(weekStart, 6), "d 'de' MMM, yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center rounded-md border border-border bg-card overflow-hidden">
            <button
              onClick={() => setMode('week')}
              className={cn(
                'px-2.5 h-8 text-xs flex items-center gap-1.5',
                mode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Semana</span>
            </button>
            <button
              onClick={() => setMode('list')}
              className={cn(
                'px-2.5 h-8 text-xs flex items-center gap-1.5',
                mode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <ListIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Lista</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs px-2"
              onClick={() => setWeekOffset(0)}
            >
              Hoje
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {mode === 'week' ? (
        <WeekGrid weekDays={weekDays} hours={hours} tasksByDay={tasksByDay} />
      ) : (
        <ListView tasks={upcoming} />
      )}
    </div>
  );
}

// ---------- Week grid (Google Calendar–style) ----------

type DragState =
  | { kind: 'move'; taskId: string; pointerOffsetMin: number; durationMin: number }
  | { kind: 'resize'; taskId: string; startTopMin: number; minDuration: number }
  | { kind: 'create'; dayKey: string; startMin: number };

function timeToMinutes(t?: string | null): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
function snap(min: number) {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
}

function WeekGrid({
  weekDays,
  hours,
  tasksByDay,
}: {
  weekDays: Date[];
  hours: number[];
  tasksByDay: Map<string, Task[]>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const updateTask = useTaskStore((s) => s.updateTask);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openTaskDetail = useTaskDetailStore((s) => s.open);

  const [drag, setDrag] = useState<DragState | null>(null);
  // Preview overrides while dragging (avoid waiting for DB roundtrip)
  const [preview, setPreview] = useState<
    Record<string, { dayKey?: string; startMin?: number; durationMin?: number }>
  >({});
  // Provisional create-rectangle (dayKey + start/end minutes)
  const [createBox, setCreateBox] = useState<{ dayKey: string; startMin: number; endMin: number } | null>(
    null
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, []);

  // Refs to each day column (hour area) to translate pointer Y → minutes
  const dayColumnsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const pointerToMinutes = useCallback((dayEl: HTMLDivElement, clientY: number) => {
    const rect = dayEl.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const min = (y / HOUR_HEIGHT) * 60;
    return Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, snap(min)));
  }, []);

  const findDayUnderPointer = useCallback((clientX: number, clientY: number): string | null => {
    for (const [k, el] of dayColumnsRef.current.entries()) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return k;
      }
    }
    return null;
  }, []);

  // Global pointer move/up while dragging
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (drag.kind === 'move') {
        const dayKey = findDayUnderPointer(e.clientX, e.clientY);
        if (!dayKey) return;
        const dayEl = dayColumnsRef.current.get(dayKey)!;
        const min = pointerToMinutes(dayEl, e.clientY) - drag.pointerOffsetMin;
        const clamped = Math.max(0, Math.min(24 * 60 - drag.durationMin, snap(min)));
        setPreview((p) => ({
          ...p,
          [drag.taskId]: { dayKey, startMin: clamped, durationMin: drag.durationMin },
        }));
      } else if (drag.kind === 'resize') {
        const taskPreview = preview[drag.taskId];
        const dayKey = taskPreview?.dayKey;
        if (!dayKey) return;
        const dayEl = dayColumnsRef.current.get(dayKey)!;
        const endMin = pointerToMinutes(dayEl, e.clientY);
        const newDuration = Math.max(drag.minDuration, snap(endMin - drag.startTopMin));
        setPreview((p) => ({
          ...p,
          [drag.taskId]: { ...p[drag.taskId], durationMin: newDuration },
        }));
      } else if (drag.kind === 'create') {
        const dayEl = dayColumnsRef.current.get(drag.dayKey);
        if (!dayEl) return;
        const cur = pointerToMinutes(dayEl, e.clientY);
        const start = Math.min(drag.startMin, cur);
        const end = Math.max(drag.startMin, cur) + SNAP_MINUTES; // include cell
        setCreateBox({ dayKey: drag.dayKey, startMin: start, endMin: end });
      }
    };

    const onUp = async () => {
      const currentDrag = drag;
      setDrag(null);

      if (currentDrag.kind === 'move' || currentDrag.kind === 'resize') {
        const p = preview[currentDrag.taskId];
        setPreview((prev) => {
          const next = { ...prev };
          delete next[currentDrag.taskId];
          return next;
        });
        if (!p) return;
        try {
          const updates: Partial<Task> = {};
          if (p.dayKey) updates.dueDate = p.dayKey;
          if (p.startMin !== undefined) updates.dueTime = minutesToTime(p.startMin);
          if (p.durationMin !== undefined) updates.durationMinutes = p.durationMin;
          await updateTask(currentDrag.taskId, updates);
        } catch (err) {
          toast.error('Falha ao reagendar tarefa');
        }
      } else if (currentDrag.kind === 'create') {
        const box = createBox;
        setCreateBox(null);
        if (box && box.endMin - box.startMin >= MIN_TASK_MINUTES) {
          openQuickAdd({
            defaultDueDate: box.dayKey,
            defaultDueTime: minutesToTime(box.startMin),
            defaultDurationMinutes: box.endMin - box.startMin,
          });
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, preview, createBox, findDayUnderPointer, pointerToMinutes, updateTask, openQuickAdd]);

  // Now indicator
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin select-none">
      <div className="min-w-[900px]">
        {/* Day header */}
        <div className="sticky top-0 z-20 grid grid-cols-[60px_repeat(7,1fr)] bg-background border-b border-border">
          <div />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'px-3 py-2 text-center border-l border-border',
                  isToday && 'bg-primary/5'
                )}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {format(day, 'EEE', { locale: ptBR })}
                </div>
                <div className={cn('text-lg font-display font-bold', isToday && 'text-primary')}>
                  {format(day, 'd')}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day row */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/20">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Dia todo
          </div>
          {weekDays.map((day) => {
            const k = format(day, 'yyyy-MM-dd');
            const allDay = (tasksByDay.get(k) || []).filter((t) => !t.dueTime);
            return (
              <div key={k} className="border-l border-border px-1 py-1 min-h-[36px] space-y-0.5">
                {allDay.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTaskDetail(t.id)}
                    className="w-full text-left border-l-[3px] bg-card hover:bg-muted/60 rounded-r px-1.5 py-1 text-[11px] truncate"
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Day columns with hour grid + absolutely positioned events */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
          {/* Hours gutter */}
          <div className="flex flex-col">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="px-2 text-[10px] text-muted-foreground/70 text-right pr-3 border-b border-border/40 -mt-[6px] first:mt-0"
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const k = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, new Date());
            // Events for this column = tasks scheduled here OR tasks dragged into here via preview
            const baseEvents = (tasksByDay.get(k) || []).filter((t) => t.dueTime);
            const previewEvents: Task[] = Object.entries(preview)
              .filter(([id, p]) => p.dayKey === k && !baseEvents.find((t) => t.id === id))
              .map(([id]) => tasksFromAny(tasksByDay, id))
              .filter(Boolean) as Task[];
            const events = [...baseEvents, ...previewEvents];

            return (
              <DayColumn
                key={k}
                dayKey={k}
                isToday={isToday}
                hoursLen={hours.length}
                events={events}
                preview={preview}
                createBox={createBox?.dayKey === k ? createBox : null}
                nowMin={isToday ? nowMin : null}
                registerRef={(el) => dayColumnsRef.current.set(k, el)}
                onStartCreate={(startMin) => {
                  setCreateBox({ dayKey: k, startMin, endMin: startMin + SNAP_MINUTES });
                  setDrag({ kind: 'create', dayKey: k, startMin });
                }}
                onClickEmpty={(startMin) => {
                  openQuickAdd({
                    defaultDueDate: k,
                    defaultDueTime: minutesToTime(startMin),
                    defaultDurationMinutes: DEFAULT_DURATION,
                  });
                }}
                onStartMove={(taskId, pointerOffsetMin, durationMin, startMin) => {
                  setPreview((p) => ({
                    ...p,
                    [taskId]: { dayKey: k, startMin, durationMin },
                  }));
                  setDrag({ kind: 'move', taskId, pointerOffsetMin, durationMin });
                }}
                onStartResize={(taskId, startTopMin, currentDuration) => {
                  setPreview((p) => ({
                    ...p,
                    [taskId]: { dayKey: k, startMin: startTopMin, durationMin: currentDuration },
                  }));
                  setDrag({ kind: 'resize', taskId, startTopMin, minDuration: MIN_TASK_MINUTES });
                }}
                onOpenTask={(id) => openTaskDetail(id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function tasksFromAny(byDay: Map<string, Task[]>, id: string): Task | null {
  for (const list of byDay.values()) {
    const found = list.find((t) => t.id === id);
    if (found) return found;
  }
  return null;
}

function DayColumn({
  dayKey,
  isToday,
  hoursLen,
  events,
  preview,
  createBox,
  nowMin,
  registerRef,
  onStartCreate,
  onClickEmpty,
  onStartMove,
  onStartResize,
  onOpenTask,
}: {
  dayKey: string;
  isToday: boolean;
  hoursLen: number;
  events: Task[];
  preview: Record<string, { dayKey?: string; startMin?: number; durationMin?: number }>;
  createBox: { dayKey: string; startMin: number; endMin: number } | null;
  nowMin: number | null;
  registerRef: (el: HTMLDivElement | null) => void;
  onStartCreate: (startMin: number) => void;
  onClickEmpty: (startMin: number) => void;
  onStartMove: (taskId: string, pointerOffsetMin: number, durationMin: number, startMin: number) => void;
  onStartResize: (taskId: string, startTopMin: number, currentDuration: number) => void;
  onOpenTask: (id: string) => void;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    localRef.current = el;
    registerRef(el);
  };

  const downStateRef = useRef<{ y: number; moved: boolean; startMin: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only start a create when clicking empty space (target is the column itself)
    if (e.target !== e.currentTarget) return;
    if (e.button !== 0) return;
    const el = localRef.current!;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const min = snap((y / HOUR_HEIGHT) * 60);
    downStateRef.current = { y, moved: false, startMin: min };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = downStateRef.current;
    if (!s || s.moved) return;
    const el = localRef.current!;
    const rect = el.getBoundingClientRect();
    const dy = Math.abs(e.clientY - rect.top - s.y);
    if (dy > 4) {
      s.moved = true;
      onStartCreate(s.startMin);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = downStateRef.current;
    downStateRef.current = null;
    if (!s) return;
    if (!s.moved && e.target === e.currentTarget) {
      onClickEmpty(s.startMin);
    }
  };

  return (
    <div
      ref={setRef}
      className={cn(
        'relative border-l border-border cursor-cell',
        isToday && 'bg-primary/[0.03]'
      )}
      style={{ height: hoursLen * HOUR_HEIGHT }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Hour lines */}
      {Array.from({ length: hoursLen }, (_, h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-b border-border/40 pointer-events-none"
          style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
        >
          {/* half-hour subtle line */}
          <div
            className="absolute left-0 right-0 border-b border-border/15"
            style={{ top: HOUR_HEIGHT / 2 }}
          />
        </div>
      ))}

      {/* Now indicator */}
      {nowMin !== null && (
        <div
          className="absolute left-0 right-0 z-[5] pointer-events-none"
          style={{ top: (nowMin / 60) * HOUR_HEIGHT }}
        >
          <div className="h-px bg-primary" />
          <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-primary" />
        </div>
      )}

      {/* Events */}
      {events.map((task) => {
        const p = preview[task.id];
        const startMin = p?.startMin ?? timeToMinutes(task.dueTime);
        const durationMin = p?.durationMin ?? task.durationMinutes ?? DEFAULT_DURATION;
        const top = (startMin / 60) * HOUR_HEIGHT;
        const height = Math.max(20, (durationMin / 60) * HOUR_HEIGHT);
        const isDragging = !!p;
        return (
          <EventBlock
            key={task.id}
            task={task}
            top={top}
            height={height}
            isDragging={isDragging}
            onPointerDownBody={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const offsetY = e.clientY - rect.top;
              const offsetMin = (offsetY / HOUR_HEIGHT) * 60;
              onStartMove(task.id, offsetMin, durationMin, startMin);
            }}
            onPointerDownResize={() => {
              onStartResize(task.id, startMin, durationMin);
            }}
            onClick={() => onOpenTask(task.id)}
          />
        );
      })}

      {/* Create rectangle */}
      {createBox && (
        <div
          className="absolute left-1 right-1 z-10 rounded-md bg-primary/30 border border-primary/60 pointer-events-none"
          style={{
            top: (createBox.startMin / 60) * HOUR_HEIGHT,
            height: Math.max(
              (SNAP_MINUTES / 60) * HOUR_HEIGHT,
              ((createBox.endMin - createBox.startMin) / 60) * HOUR_HEIGHT
            ),
          }}
        >
          <div className="px-1.5 py-0.5 text-[10px] text-primary-foreground font-medium">
            {minutesToTime(createBox.startMin)} – {minutesToTime(createBox.endMin)}
          </div>
        </div>
      )}
    </div>
  );
}

function EventBlock({
  task,
  top,
  height,
  isDragging,
  onPointerDownBody,
  onPointerDownResize,
  onClick,
}: {
  task: Task;
  top: number;
  height: number;
  isDragging: boolean;
  onPointerDownBody: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDownResize: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClick: () => void;
}) {
  const project = useTaskStore((s) => s.projects.find((p) => p.id === task.projectId));
  const priorityBorder: Record<number, string> = {
    1: 'border-l-priority-1',
    2: 'border-l-priority-2',
    3: 'border-l-priority-3',
    4: 'border-l-muted-foreground/40',
  };
  const downRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  return (
    <div
      className={cn(
        'absolute left-1 right-1 rounded-md border-l-[3px] bg-card shadow-sm overflow-hidden group',
        priorityBorder[task.priority],
        isDragging ? 'opacity-90 ring-2 ring-primary z-30 cursor-grabbing' : 'hover:shadow-md cursor-grab z-10'
      )}
      style={{ top, height }}
      onPointerDown={(e) => {
        e.stopPropagation();
        downRef.current = { x: e.clientX, y: e.clientY, moved: false };
        onPointerDownBody(e);
      }}
      onPointerMove={(e) => {
        const d = downRef.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3) d.moved = true;
      }}
      onPointerUp={(e) => {
        const d = downRef.current;
        downRef.current = null;
        if (d && !d.moved) {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      <div className="px-1.5 py-1 text-[11px] font-medium leading-tight truncate">
        {task.dueTime && (
          <span className="text-muted-foreground mr-1">{task.dueTime}</span>
        )}
        {task.title}
      </div>
      {project && !project.isInbox && height > 32 && (
        <div className="px-1.5 flex items-center gap-1 text-[10px] text-muted-foreground truncate">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
          {project.name}
        </div>
      )}
      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-primary/30"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDownResize(e);
        }}
      />
    </div>
  );
}

// ---------- List view (unchanged) ----------

function ListView({ tasks }: { tasks: Task[] }) {
  const grouped = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1));
    const map: Record<string, Task[]> = {};
    for (const t of sorted) {
      const d = parseISO(t.dueDate!);
      const key = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
      {Object.entries(grouped).map(([group, groupTasks]) => (
        <div key={group} className="mb-4">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 capitalize">
            {group}
          </h3>
          {groupTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      ))}
      <AddTaskForm />
      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <CalendarRange className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Nada agendado</p>
        </div>
      )}
    </div>
  );
}
