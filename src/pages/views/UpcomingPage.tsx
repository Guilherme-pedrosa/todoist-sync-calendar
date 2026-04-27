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
  LayoutGrid,
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
import { expandOccurrencesInRange } from '@/lib/recurrence';
import { KanbanBoard } from '@/components/KanbanBoard';

type Mode = 'list' | 'week' | 'day' | 'kanban';

const DAY_START_HOUR = 7; // grid começa às 07:00
const DAY_END_HOUR = 24; // até meia-noite
const HOUR_HEIGHT = 48; // px por hora
const MIN_TASK_MINUTES = 15;
const SNAP_MINUTES = 15;
const DEFAULT_DURATION = 60;
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;

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
    () =>
      mode === 'day'
        ? [new Date()]
        : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart, mode]
  );
  const hours = useMemo(
    () => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR),
    []
  );

  // Range visível (último dia da grade)
  const rangeEnd = useMemo(
    () => weekDays[weekDays.length - 1] ?? weekStart,
    [weekDays, weekStart]
  );
  const rangeStart = useMemo(() => weekDays[0] ?? weekStart, [weekDays, weekStart]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    const rangeStartIso = format(rangeStart, 'yyyy-MM-dd');
    const rangeEndIso = format(rangeEnd, 'yyyy-MM-dd');

    for (const t of tasks) {
      if (t.completed || t.parentId || !t.dueDate) continue;

      let dayKeys: string[] = [];
      if (t.recurrenceRule) {
        // Anchor must be on or before range end to expand
        if (t.dueDate <= rangeEndIso) {
          dayKeys = expandOccurrencesInRange(
            t.recurrenceRule,
            t.dueDate,
            t.dueTime,
            rangeStart,
            rangeEnd
          );
        }
      } else if (t.dueDate >= rangeStartIso && t.dueDate <= rangeEndIso) {
        dayKeys = [t.dueDate];
      }

      for (const k of dayKeys) {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(t);
      }
    }
    return map;
  }, [tasks, rangeStart, rangeEnd]);

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
          <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">
            {mode === 'day' ? 'Hoje' : 'Em breve'}
          </h2>
          <p className="text-[11px] sm:text-xs text-muted-foreground capitalize truncate">
            {mode === 'day'
              ? format(new Date(), "EEEE, d 'de' MMM, yyyy", { locale: ptBR })
              : `${format(weekStart, "d 'de' MMM", { locale: ptBR })} — ${format(addDays(weekStart, 6), "d 'de' MMM, yyyy", { locale: ptBR })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center rounded-md border border-border bg-card overflow-hidden">
            <button
              onClick={() => { setMode('day'); setWeekOffset(0); }}
              className={cn(
                'px-2.5 h-8 text-xs flex items-center gap-1.5',
                mode === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hoje</span>
            </button>
            <button
              onClick={() => setMode('week')}
              className={cn(
                'px-2.5 h-8 text-xs flex items-center gap-1.5 border-l border-border',
                mode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Semana</span>
            </button>
            <button
              onClick={() => setMode('list')}
              className={cn(
                'px-2.5 h-8 text-xs flex items-center gap-1.5 border-l border-border',
                mode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <ListIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Lista</span>
            </button>
            <button
              onClick={() => setMode('kanban')}
              className={cn(
                'px-2.5 h-8 text-xs flex items-center gap-1.5 border-l border-border',
                mode === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Kanban</span>
            </button>
          </div>
          {mode !== 'day' && mode !== 'kanban' && (
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
          )}
        </div>
      </header>

      {mode === 'kanban' ? (
        <KanbanBoard tasks={upcoming} boardKey="upcoming" />
      ) : mode === 'week' || mode === 'day' ? (
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

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const nh = Math.floor(normalized / 60);
  const nm = normalized % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
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
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  // Refs to each day column (hour area) to translate pointer Y → minutes
  const dayColumnsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const pointerToMinutes = useCallback((dayEl: HTMLDivElement, clientY: number) => {
    const rect = dayEl.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const min = DAY_START_MIN + (y / HOUR_HEIGHT) * 60;
    return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SNAP_MINUTES, snap(min)));
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
        const clamped = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - drag.durationMin, snap(min)));
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

  const numDays = weekDays.length;
  const isDayMode = numDays === 1;
  const gridCols = isDayMode ? 'grid-cols-[60px_1fr]' : 'grid-cols-[60px_repeat(7,1fr)]';
  const minWidth = isDayMode ? '' : 'min-w-[900px]';

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin select-none">
      <div className={minWidth}>
        {/* Day header */}
        <div className={cn('sticky top-0 z-20 grid bg-background border-b border-border', gridCols)}>
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
        <div className={cn('grid border-b border-border bg-muted/20 sticky top-[60px] z-[15] bg-background/95 backdrop-blur', gridCols)}>
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Dia todo
          </div>
          {weekDays.map((day) => {
            const k = format(day, 'yyyy-MM-dd');
            const allDay = (tasksByDay.get(k) || []).filter((t) => !t.dueTime);
            return (
              <div
                key={k}
                className="border-l border-border px-1 py-1 min-h-[36px] max-h-[96px] overflow-y-auto scrollbar-thin space-y-0.5"
              >
                {allDay.map((t) => (
                  <AllDayChip
                    key={t.id}
                    task={t}
                    onOpen={() => openTaskDetail(t.id)}
                    onStartDrag={(pointerOffsetMin) => {
                      // Coloca um preview "neutro" (dayKey/startMin serão atualizados pelo onMove global)
                      setPreview((p) => ({
                        ...p,
                        [t.id]: { dayKey: k, startMin: 9 * 60, durationMin: DEFAULT_DURATION },
                      }));
                      setDrag({
                        kind: 'move',
                        taskId: t.id,
                        pointerOffsetMin,
                        durationMin: DEFAULT_DURATION,
                      });
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Day columns with hour grid + absolutely positioned events */}
        <div className={cn('grid relative', gridCols)}>
          {/* Hours gutter — labels alinhados ao topo de cada slot (igual Google Calendar) */}
          <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-muted-foreground/70 -translate-y-1/2 pr-1 bg-background"
                style={{ top: i * HOUR_HEIGHT }}
              >
                {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
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
    const min = snap(DAY_START_MIN + (y / HOUR_HEIGHT) * 60);
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
      {nowMin !== null && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN && (
        <div
          className="absolute left-0 right-0 z-[5] pointer-events-none"
          style={{ top: ((nowMin - DAY_START_MIN) / 60) * HOUR_HEIGHT }}
        >
          <div className="h-px bg-primary" />
          <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-primary" />
        </div>
      )}

      {/* Events with overlap-aware column layout */}
      {(() => {
        // Compute start/end (in minutes) for each event including drag preview
        const items = events.map((task) => {
          const p = preview[task.id];
          const startMin = p?.startMin ?? timeToMinutes(task.dueTime);
          const durationMin = p?.durationMin ?? task.durationMinutes ?? DEFAULT_DURATION;
          return { task, startMin, endMin: startMin + durationMin, durationMin };
        });
        // Sort by start, then by longer first
        items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

        // Greedy column packing within overlap clusters
        type Laid = (typeof items)[number] & { col: number; cols: number };
        const laid: Laid[] = [];
        let cluster: Laid[] = [];
        let clusterEnd = -Infinity;
        const flush = () => {
          const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
          cluster.forEach((c) => (c.cols = cols));
          laid.push(...cluster);
          cluster = [];
          clusterEnd = -Infinity;
        };
        for (const it of items) {
          if (it.startMin >= clusterEnd) flush();
          // pick the lowest free column index
          const used = new Set(
            cluster.filter((c) => c.endMin > it.startMin).map((c) => c.col)
          );
          let col = 0;
          while (used.has(col)) col++;
          cluster.push({ ...it, col, cols: 1 });
          clusterEnd = Math.max(clusterEnd, it.endMin);
        }
        flush();

        return laid.map(({ task, startMin, durationMin, col, cols }) => {
          const top = ((startMin - DAY_START_MIN) / 60) * HOUR_HEIGHT;
          const height = Math.max(20, (durationMin / 60) * HOUR_HEIGHT);
          const isDragging = !!preview[task.id];
          return (
            <EventBlock
              key={task.id}
              task={task}
              top={top}
              height={height}
              durationMin={durationMin}
              col={col}
              cols={cols}
              isDragging={isDragging}
              onStartMoveAt={(e) => {
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
        });
      })()}

      {/* Create rectangle */}
      {createBox && (
        <div
          className="absolute left-1 right-1 z-10 rounded-md bg-primary/30 border border-primary/60 pointer-events-none"
          style={{
            top: ((createBox.startMin - DAY_START_MIN) / 60) * HOUR_HEIGHT,
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
  durationMin,
  isDragging,
  onStartMoveAt,
  onPointerDownResize,
  onClick,
}: {
  task: Task;
  top: number;
  height: number;
  durationMin: number;
  isDragging: boolean;
  onStartMoveAt: (e: React.PointerEvent<HTMLDivElement>) => void;
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
  const downRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    pointerId: number;
    started: boolean;
  } | null>(null);

  const endInteraction = (el: HTMLDivElement, pointerId: number) => {
    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    } catch {}
  };

  return (
    <div
      className={cn(
        'absolute left-1 right-1 rounded-md border-l-[3px] bg-card shadow-sm overflow-hidden group touch-none',
        priorityBorder[task.priority],
        isDragging ? 'opacity-90 ring-2 ring-primary z-30 cursor-grabbing' : 'hover:shadow-md cursor-grab z-10'
      )}
      style={{ top, height }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const el = e.currentTarget;
        try { el.setPointerCapture(e.pointerId); } catch {}
        downRef.current = {
          x: e.clientX,
          y: e.clientY,
          moved: false,
          pointerId: e.pointerId,
          started: false,
        };
      }}
      onPointerMove={(e) => {
        const d = downRef.current;
        if (!d) return;
        if (!d.moved && (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4)) {
          d.moved = true;
        }
        if (d.moved && !d.started) {
          d.started = true;
          // Release capture so the global window listeners (in WeekGrid) take over
          // and pointer events can hit other day columns.
          endInteraction(e.currentTarget, d.pointerId);
          onStartMoveAt(e);
        }
      }}
      onPointerUp={(e) => {
        const d = downRef.current;
        downRef.current = null;
        endInteraction(e.currentTarget, e.pointerId);
        if (d && !d.moved) {
          e.stopPropagation();
          onClick();
        }
      }}
      onPointerCancel={(e) => {
        const d = downRef.current;
        downRef.current = null;
        if (d) endInteraction(e.currentTarget, d.pointerId);
      }}
    >
      <div className="px-1.5 py-1 text-[11px] font-medium leading-tight break-words whitespace-normal">
        {task.dueTime && (
          <span className="text-muted-foreground mr-1">
            {`${task.dueTime}–${addMinutesToTime(task.dueTime, durationMin)}`}
          </span>
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

function AllDayChip({
  task,
  onOpen,
  onStartDrag,
}: {
  task: Task;
  onOpen: () => void;
  onStartDrag: (pointerOffsetMin: number) => void;
}) {
  const downRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        downRef.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const d = downRef.current;
        if (!d || d.moved) return;
        if (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4) {
          d.moved = true;
          onStartDrag(0);
        }
      }}
      onPointerUp={(e) => {
        const d = downRef.current;
        downRef.current = null;
        if (d && !d.moved) {
          e.stopPropagation();
          onOpen();
        }
      }}
      className="w-full text-left border-l-[3px] bg-card hover:bg-muted/60 rounded-r px-1.5 py-1 text-[11px] truncate cursor-grab active:cursor-grabbing select-none"
      title={`${task.title} — arraste para um horário`}
    >
      {task.title}
    </div>
  );
}

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
