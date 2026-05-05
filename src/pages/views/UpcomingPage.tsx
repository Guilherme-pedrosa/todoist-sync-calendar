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
  Sparkles,
  CalendarPlus,
} from 'lucide-react';
import { ScheduleMeetingDialog } from '@/components/ScheduleMeetingDialog';
import { useAIAssistantStore } from '@/store/aiAssistantStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
  differenceInCalendarDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { expandOccurrencesInRange } from '@/lib/recurrence';
import { KanbanBoard } from '@/components/KanbanBoard';
import { useUpdateTaskWithRecurrencePrompt } from '@/hooks/useUpdateTaskWithRecurrencePrompt';
import { useCompleteTask } from '@/hooks/useCompleteTask';
import { Check } from 'lucide-react';
import { getHolidayForDate } from '@/lib/holidays';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'list' | 'week' | 'day' | 'kanban';
type RecurringCompletionRow = {
  id: string;
  task_id: string;
  user_id: string;
  occurrence_date: string;
  occurrence_time: string | null;
  duration_minutes: number | null;
  title: string;
  completed_at: string;
};

const DAY_START_HOUR = 6; // grid começa às 06:00
const DAY_END_HOUR = 24; // até meia-noite
const HOUR_HEIGHT = 96; // px por hora — 4 blocos de 15 min × 24px
const MIN_TASK_MINUTES = 15;
const MIN_EVENT_HEIGHT = 22; // cabe dentro de um slot de 15 min sem invadir o próximo
const SNAP_MINUTES = 15;
const DEFAULT_DURATION = 60;
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;

export default function UpcomingPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const { user } = useAuth();
  const currentUserId = user?.id;
  const [meetingOpen, setMeetingOpen] = useState(false);
  // Em telas pequenas (mobile), começa em modo "dia" — semana com 7 colunas é inutilizável no celular.
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  );
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (!dateParam) return;
    const target = parseISO(`${dateParam}T12:00:00`);
    if (Number.isNaN(target.getTime())) return;
    setMode('day');
    setWeekOffset(differenceInCalendarDays(target, new Date()));
  }, []);

  // Mostra somente tarefas atribuídas ao usuário atual.
  // Se ainda não há lista de responsáveis carregada (legado), mantemos a tarefa visível para não esconder dados.
  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (!currentUserId) return true;
        const ids = t.assigneeIds;
        if (!ids || ids.length === 0) return true;
        return ids.includes(currentUserId);
      }),
    [tasks, currentUserId]
  );

  const upcoming = useMemo(
    () =>
      visibleTasks.filter(
        (t) => !t.completed && !t.parentId && t.dueDate && t.dueDate >= new Date().toISOString().slice(0, 10)
      ),
    [visibleTasks]
  );

  const weekStart = useMemo(
    () => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset),
    [weekOffset]
  );
  const weekDays = useMemo(
    () =>
      mode === 'day'
        ? [addDays(new Date(), weekOffset)]
        : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart, mode, weekOffset]
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
  const [recurringCompletions, setRecurringCompletions] = useState<RecurringCompletionRow[]>([]);

  useEffect(() => {
    if (!currentUserId) return;
    const rangeStartIso = format(rangeStart, 'yyyy-MM-dd');
    const rangeEndIso = format(rangeEnd, 'yyyy-MM-dd');

    supabase
      .from('recurring_task_completions' as any)
      .select('id, task_id, user_id, occurrence_date, occurrence_time, duration_minutes, title, completed_at')
      .eq('user_id', currentUserId)
      .gte('occurrence_date', rangeStartIso)
      .lte('occurrence_date', rangeEndIso)
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar ocorrências concluídas', error);
          setRecurringCompletions([]);
          return;
        }
        setRecurringCompletions((data || []) as unknown as RecurringCompletionRow[]);
      });
  }, [currentUserId, rangeStart, rangeEnd, visibleTasks]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    const rangeStartIso = format(rangeStart, 'yyyy-MM-dd');
    const rangeEndIso = format(rangeEnd, 'yyyy-MM-dd');

    for (const t of visibleTasks) {
      if (t.parentId || !t.dueDate) continue;

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

    for (const completion of recurringCompletions) {
      const source = visibleTasks.find((t) => t.id === completion.task_id);
      const k = completion.occurrence_date;
      if (!source || k < rangeStartIso || k > rangeEndIso) continue;
      const completedOccurrence: Task = {
        ...source,
        id: `recurring-completion:${completion.id}`,
        sourceTaskId: source.id,
        recurringCompletionId: completion.id,
        isRecurringCompletion: true,
        title: completion.title || source.title,
        dueDate: k,
        dueTime: completion.occurrence_time?.slice(0, 5) || source.dueTime,
        durationMinutes: completion.duration_minutes ?? source.durationMinutes ?? null,
        completed: true,
        completedAt: completion.completed_at,
      };
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(completedOccurrence);
    }
    return map;
  }, [visibleTasks, rangeStart, rangeEnd, recurringCompletions]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="hidden p-1.5 -ml-1 rounded-md hover:bg-muted transition-colors shrink-0"
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
              ? format(addDays(new Date(), weekOffset), "EEEE, d 'de' MMM, yyyy", { locale: ptBR })
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
          {mode !== 'kanban' && (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setWeekOffset((w) => w - 1)} aria-label={mode === 'day' ? 'Dia anterior' : 'Semana anterior'}>
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
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setWeekOffset((w) => w + 1)} aria-label={mode === 'day' ? 'Próximo dia' : 'Próxima semana'}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setMeetingOpen(true)}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reunião</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => useAIAssistantStore.getState().open('analyze')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">IA</span>
          </Button>
        </div>
      </header>

      <ScheduleMeetingDialog open={meetingOpen} onOpenChange={setMeetingOpen} />

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
  | { kind: 'move'; taskId: string; pointerOffsetMin: number; durationMin: number; sourceDayKey: string }
  | { kind: 'resize'; taskId: string; startTopMin: number; minDuration: number; sourceDayKey: string }
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

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isTaskOverdue(task: Task, occurrenceDate = task.dueDate, endMin?: number): boolean {
  if (task.completed || !occurrenceDate) return false;

  const todayStr = localDateKey();
  if (occurrenceDate < todayStr) return true;
  if (occurrenceDate > todayStr) return false;
  if (!task.dueTime && endMin === undefined) return false;

  const effectiveEndMin = endMin ?? timeToMinutes(task.dueTime) + (task.durationMinutes ?? 0);
  const now = new Date();
  return effectiveEndMin < now.getHours() * 60 + now.getMinutes();
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
  const updateWithPrompt = useUpdateTaskWithRecurrencePrompt();
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openTaskDetail = useTaskDetailStore((s) => s.open);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Preview overrides while dragging (avoid waiting for DB roundtrip)
  const [preview, setPreview] = useState<
    Record<string, { dayKey?: string; startMin?: number; durationMin?: number }>
  >({});
  const previewRef = useRef(preview);
  // Provisional create-rectangle (dayKey + start/end minutes)
  const [createBox, setCreateBox] = useState<{ dayKey: string; startMin: number; endMin: number } | null>(
    null
  );
  const createBoxRef = useRef(createBox);

  // Keep refs in sync so global listeners always see latest values without re-attaching
  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => { previewRef.current = preview; }, [preview]);
  useEffect(() => { createBoxRef.current = createBox; }, [createBox]);

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

  const updateDragPreview = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (!d) return;

    if (d.kind === 'move') {
      const dayKey = findDayUnderPointer(clientX, clientY);
      if (!dayKey) return;
      const dayEl = dayColumnsRef.current.get(dayKey);
      if (!dayEl) return;
      const min = pointerToMinutes(dayEl, clientY) - d.pointerOffsetMin;
      const clamped = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - d.durationMin, snap(min)));
      setPreview((p) => ({
        ...p,
        [d.taskId]: { dayKey, startMin: clamped, durationMin: d.durationMin },
      }));
    } else if (d.kind === 'resize') {
      const taskPreview = previewRef.current[d.taskId];
      const dayKey = taskPreview?.dayKey;
      if (!dayKey) return;
      const dayEl = dayColumnsRef.current.get(dayKey);
      if (!dayEl) return;
      const endMin = pointerToMinutes(dayEl, clientY);
      const newDuration = Math.max(d.minDuration, snap(endMin - d.startTopMin));
      setPreview((p) => ({
        ...p,
        [d.taskId]: { ...p[d.taskId], durationMin: newDuration },
      }));
    } else if (d.kind === 'create') {
      const dayEl = dayColumnsRef.current.get(d.dayKey);
      if (!dayEl) return;
      const cur = pointerToMinutes(dayEl, clientY);
      const start = Math.min(d.startMin, cur);
      const end = Math.max(d.startMin, cur) + SNAP_MINUTES;
      setCreateBox({ dayKey: d.dayKey, startMin: start, endMin: end });
    }
  }, [findDayUnderPointer, pointerToMinutes]);

  const finishDrag = useCallback(async () => {
    const currentDrag = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!currentDrag) return;

    if (currentDrag.kind === 'move' || currentDrag.kind === 'resize') {
      const p = previewRef.current[currentDrag.taskId];
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
        await updateWithPrompt(currentDrag.taskId, updates, {
          occurrenceDate: currentDrag.sourceDayKey,
          changeLabel: currentDrag.kind === 'resize' ? 'duração' : 'data e horário',
        });
      } catch (err) {
        toast.error('Falha ao reagendar tarefa');
      }
    } else if (currentDrag.kind === 'create') {
      const box = createBoxRef.current;
      setCreateBox(null);
      if (box && box.endMin - box.startMin >= MIN_TASK_MINUTES) {
        openQuickAdd({
          defaultDueDate: box.dayKey,
          defaultDueTime: minutesToTime(box.startMin),
          defaultDurationMinutes: box.endMin - box.startMin,
        });
      }
    }
  }, [openQuickAdd, updateWithPrompt]);

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setPreview({});
    setCreateBox(null);
  }, []);

  // Global move/end while dragging. Touch uses non-passive listeners so, after a long-press,
  // the calendar owns the gesture instead of the browser turning it into page scroll.
  useEffect(() => {
    if (!drag) return;

    const onPointerMove = (e: PointerEvent) => updateDragPreview(e.clientX, e.clientY);
    const onPointerUp = () => { void finishDrag(); };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      updateDragPreview(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      void finishDrag();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') cancelDrag();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('blur', cancelDrag);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [!!drag, cancelDrag, finishDrag, updateDragPreview]);

  // Now indicator — atualiza a cada 30s e sempre que a aba volta a ficar visível/focada
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const numDays = weekDays.length;
  const isDayMode = numDays === 1;
  const gridCols = isDayMode ? 'grid-cols-[60px_1fr]' : 'grid-cols-[60px_repeat(7,1fr)]';
  const minWidth = isDayMode ? '' : 'min-w-[900px]';
  const visibleRangeStart = format(weekDays[0] ?? new Date(), 'yyyy-MM-dd');
  const visibleRangeEnd = format(weekDays[weekDays.length - 1] ?? new Date(), 'yyyy-MM-dd');

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin select-none">
      <div className={minWidth}>
        {/* Day header */}
        <div className={cn('sticky top-0 z-20 grid bg-background border-b border-border', gridCols)}>
          <div />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, new Date());
            const dayKey = format(day, 'yyyy-MM-dd');
            const holiday = getHolidayForDate(dayKey);
            const isNationalHoliday = holiday?.type === 'national';
            return (
              <div
                key={day.toISOString()}
                title={holiday?.name}
                className={cn(
                  'px-3 py-2 text-center border-l border-border',
                  isToday && 'bg-primary/5',
                  isNationalHoliday && !isToday && 'bg-destructive/5'
                )}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {format(day, 'EEE', { locale: ptBR })}
                </div>
                <div
                  className={cn(
                    'text-lg font-display font-bold',
                    isToday && 'text-primary',
                    !isToday && isNationalHoliday && 'text-destructive'
                  )}
                >
                  {format(day, 'd')}
                </div>
                {holiday && (
                  <div
                    className={cn(
                      'mt-0.5 text-[9px] font-medium leading-tight truncate',
                      isNationalHoliday ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    🎉 {holiday.name}
                  </div>
                )}
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
                    occurrenceDate={k}
                    onOpen={() => openTaskDetail(t.sourceTaskId ?? t.id, { occurrenceDate: k, rangeStart: visibleRangeStart, rangeEnd: visibleRangeEnd })}
                    onStartDrag={(pointerOffsetMin) => {
                      if (t.isRecurringCompletion) return;
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
                        sourceDayKey: k,
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
                onStartMove={(taskId, pointerOffsetMin, durationMin, startMin, clientX, clientY) => {
                  const targetDayKey =
                    clientX !== undefined && clientY !== undefined ? findDayUnderPointer(clientX, clientY) ?? k : k;
                  const targetDayEl = dayColumnsRef.current.get(targetDayKey);
                  const targetStart =
                    clientY !== undefined && targetDayEl
                      ? Math.max(
                          DAY_START_MIN,
                          Math.min(DAY_END_MIN - durationMin, snap(pointerToMinutes(targetDayEl, clientY) - pointerOffsetMin))
                        )
                      : startMin;

                  setPreview((p) => ({
                    ...p,
                    [taskId]: { dayKey: targetDayKey, startMin: targetStart, durationMin },
                  }));
                  setDrag({ kind: 'move', taskId, pointerOffsetMin, durationMin, sourceDayKey: k });
                }}
                onStartResize={(taskId, startTopMin, currentDuration) => {
                  setPreview((p) => ({
                    ...p,
                    [taskId]: { dayKey: k, startMin: startTopMin, durationMin: currentDuration },
                  }));
                  setDrag({ kind: 'resize', taskId, startTopMin, minDuration: MIN_TASK_MINUTES, sourceDayKey: k });
                }}
                onOpenTask={(id, occurrenceDate) => openTaskDetail(id, { occurrenceDate, rangeStart: visibleRangeStart, rangeEnd: visibleRangeEnd })}
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
  onStartMove: (
    taskId: string,
    pointerOffsetMin: number,
    durationMin: number,
    startMin: number,
    clientX?: number,
    clientY?: number
  ) => void;
  onStartResize: (taskId: string, startTopMin: number, currentDuration: number) => void;
  onOpenTask: (id: string, occurrenceDate: string) => void;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    localRef.current = el;
    registerRef(el);
  };

  const downStateRef = useRef<{
    y: number;
    moved: boolean;
    startMin: number;
  } | null>(null);
  const touchCreateRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    started: boolean;
    startMin: number;
    longPressTimer: number | null;
    longPressFired: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
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

  const onPointerCancel = () => {
    downStateRef.current = null;
  };

  const clearTouchCreate = () => {
    const s = touchCreateRef.current;
    if (s?.longPressTimer != null) clearTimeout(s.longPressTimer);
    touchCreateRef.current = null;
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1 || e.target !== e.currentTarget) return;
    const touch = e.touches[0];
    const el = localRef.current!;
    const rect = el.getBoundingClientRect();
    const y = touch.clientY - rect.top;
    const startMin = snap(DAY_START_MIN + (y / HOUR_HEIGHT) * 60);
    touchCreateRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      moved: false,
      started: false,
      startMin,
      longPressFired: false,
      longPressTimer: window.setTimeout(() => {
        const current = touchCreateRef.current;
        if (!current || current.moved) return;
        current.longPressFired = true;
        try { (navigator as any).vibrate?.(15); } catch {}
      }, 360) as unknown as number,
    };
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = touchCreateRef.current;
    const touch = e.touches[0];
    if (!s || !touch) return;
    const dx = Math.abs(touch.clientX - s.x);
    const dy = Math.abs(touch.clientY - s.y);

    if (!s.longPressFired) {
      if (dx > 12 || dy > 12) clearTouchCreate();
      return;
    }

    e.preventDefault();
    if (!s.started) {
      s.started = true;
      s.moved = true;
      if (s.longPressTimer != null) {
        clearTimeout(s.longPressTimer);
        s.longPressTimer = null;
      }
      onStartCreate(s.startMin);
    }
  };

  const onTouchEnd = () => {
    clearTouchCreate();
  };

  return (
    <div
      ref={setRef}
      className={cn(
        'relative border-l border-border cursor-cell',
        isToday && 'bg-primary/[0.03]'
      )}
      style={{ height: hoursLen * HOUR_HEIGHT, touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Hour lines com sub-divisões de 15 min */}
      {Array.from({ length: hoursLen }, (_, h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-b border-border/40 pointer-events-none"
          style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
        >
          {/* :15 */}
          <div
            className="absolute left-0 right-0 border-b border-border/10"
            style={{ top: HOUR_HEIGHT / 4 }}
          />
          {/* :30 (mais visível) */}
          <div
            className="absolute left-0 right-0 border-b border-border/20"
            style={{ top: HOUR_HEIGHT / 2 }}
          />
          {/* :45 */}
          <div
            className="absolute left-0 right-0 border-b border-border/10"
            style={{ top: (HOUR_HEIGHT * 3) / 4 }}
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
        // Detecta sobreposição REAL no tempo (a.start < b.end && b.start < a.end).
        // Tarefas consecutivas (uma terminando exatamente quando a outra começa)
        // NÃO são consideradas sobrepostas — ficam empilhadas em coluna única,
        // ocupando 100% da largura. Só dividem em colunas lado a lado quando
        // realmente colidem no tempo.
        const items = events.map((task) => {
          const p = preview[task.id];
          const startMin = p?.startMin ?? timeToMinutes(task.dueTime);
          const durationMin = p?.durationMin ?? task.durationMinutes ?? DEFAULT_DURATION;
          return { task, startMin, endMin: startMin + durationMin, durationMin };
        });
        // Sort by start, then by longer first
        items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

        type Laid = (typeof items)[number] & { col: number; cols: number };
        const laid: Laid[] = [];
        let cluster: Laid[] = [];
        let clusterEnd = -Infinity;

        const flush = () => {
          for (const a of cluster) {
            let maxCols = a.col + 1;
            for (const b of cluster) {
              if (a === b) continue;
              const overlaps = a.startMin < b.endMin && b.startMin < a.endMin;
              if (overlaps) maxCols = Math.max(maxCols, b.col + 1);
            }
            a.cols = maxCols;
          }
          laid.push(...cluster);
          cluster = [];
          clusterEnd = -Infinity;
        };

        for (const it of items) {
          // Cluster apenas quando há sobreposição real (start estritamente antes do fim)
          if (it.startMin >= clusterEnd) flush();
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
          const height = Math.max(MIN_EVENT_HEIGHT, (durationMin / 60) * HOUR_HEIGHT);
          const isDragging = !!preview[task.id];
          return (
            <EventBlock
              key={task.id}
              task={task}
                dayKey={dayKey}
              top={top}
              height={height}
              startMin={startMin}
              durationMin={durationMin}
              col={col}
              cols={cols}
              isDragging={isDragging}
              onStartMoveAt={(e) => {
                if (task.isRecurringCompletion) return;
                const point = 'touches' in e ? e.touches[0] : e;
                if (!point) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const offsetY = point.clientY - rect.top;
                const offsetMin = (offsetY / HOUR_HEIGHT) * 60;
                onStartMove(task.id, offsetMin, durationMin, startMin, point.clientX, point.clientY);
              }}
              onPointerDownResize={() => {
                if (task.isRecurringCompletion) return;
                onStartResize(task.id, startMin, durationMin);
              }}
              onClick={() => onOpenTask(task.sourceTaskId ?? task.id, dayKey)}
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
  dayKey,
  top,
  height,
  startMin,
  durationMin,
  col,
  cols,
  isDragging,
  onStartMoveAt,
  onPointerDownResize,
  onClick,
}: {
  task: Task;
  dayKey: string;
  top: number;
  height: number;
  startMin: number;
  durationMin: number;
  col: number;
  cols: number;
  isDragging: boolean;
  onStartMoveAt: (e: React.PointerEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
  onPointerDownResize: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClick: () => void;
}) {
  const project = useTaskStore((s) => s.projects.find((p) => p.id === task.projectId));
  const completeTask = useCompleteTask();
  const isRecurring = !!task.recurrenceRule;
  const isDone = task.completed;
  const isHistoricalCompletion = !!task.isRecurringCompletion;
  const isOverdue = isTaskOverdue(task, dayKey, startMin + durationMin);

  // Variant styles: completed wins, overdue next, then recurring, then default (priority border).
  const priorityBorder: Record<number, string> = {
    1: 'border-l-priority-1',
    2: 'border-l-priority-2',
    3: 'border-l-priority-3',
    4: 'border-l-muted-foreground/40',
  };
  const variantClasses = isDone
    ? 'bg-success/15 border-l-success border-success/40'
    : isOverdue
    ? 'bg-destructive/15 border-l-destructive border-destructive/50 text-destructive'
    : isRecurring
    ? 'bg-recurring/10 border-l-recurring border-recurring/30'
    : `bg-card ${priorityBorder[task.priority]}`;
  const downRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    pointerId: number;
    started: boolean;
    longPressTimer: number | null;
  } | null>(null);
  const touchMoveRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    started: boolean;
    longPressTimer: number | null;
    longPressFired: boolean;
  } | null>(null);
  const lastTapRef = useRef<number>(0);

  const endInteraction = (el: HTMLDivElement, pointerId: number) => {
    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    } catch {}
  };

  // Column layout: split horizontal space among overlapping events
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;
  return (
    <div
      className={cn(
        'absolute rounded-md border-l-[3px] shadow-sm overflow-hidden group',
        variantClasses,
        isDragging
          ? 'opacity-90 ring-2 ring-primary z-30 cursor-grabbing'
          : isHistoricalCompletion
          ? 'hover:shadow-md cursor-default z-10'
          : 'hover:shadow-md cursor-grab z-10'
      )}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        // Allow vertical scrolling on touch; drag is gated by long-press
        touchAction: 'pan-y',
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') return;
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
          longPressTimer: null,
        };
      }}
      onPointerMove={(e) => {
        const d = downRef.current;
        if (!d) return;
        const dx = Math.abs(e.clientX - d.x);
        const dy = Math.abs(e.clientY - d.y);
        const moveThreshold = 4;

        if (!d.moved && (dx > moveThreshold || dy > moveThreshold)) {
          d.moved = true;
        }
        if (d.moved && !d.started) {
          d.started = true;
          if (d.longPressTimer != null) {
            clearTimeout(d.longPressTimer);
            d.longPressTimer = null;
          }
          // Release capture so the global window listeners (in WeekGrid) take over
          // and pointer events can hit other day columns.
          endInteraction(e.currentTarget, d.pointerId);
          onStartMoveAt(e);
        }
      }}
      onPointerUp={(e) => {
        const d = downRef.current;
        downRef.current = null;
        if (d?.longPressTimer != null) {
          clearTimeout(d.longPressTimer);
        }
        endInteraction(e.currentTarget, e.pointerId);
        if (d && !d.moved) {
          e.stopPropagation();
          onClick();
        }
      }}
      onPointerCancel={(e) => {
        const d = downRef.current;
        downRef.current = null;
        if (d?.longPressTimer != null) {
          clearTimeout(d.longPressTimer);
        }
        if (d) endInteraction(e.currentTarget, d.pointerId);
      }}
      onTouchStart={(e) => {
        if (isHistoricalCompletion || e.touches.length !== 1) return;
        const touch = e.touches[0];
        touchMoveRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          moved: false,
          started: false,
          longPressFired: false,
          longPressTimer: window.setTimeout(() => {
            const d = touchMoveRef.current;
            if (!d || d.moved || d.started) return;
            d.longPressFired = true;
            try { (navigator as any).vibrate?.(15); } catch {}
          }, 320) as unknown as number,
        };
      }}
      onTouchMove={(e) => {
        const d = touchMoveRef.current;
        const touch = e.touches[0];
        if (!d || !touch) return;
        const dx = Math.abs(touch.clientX - d.x);
        const dy = Math.abs(touch.clientY - d.y);

        if (!d.longPressFired) {
          if (dx > 12 || dy > 12) {
            if (d.longPressTimer != null) clearTimeout(d.longPressTimer);
            touchMoveRef.current = null;
          }
          return;
        }

        e.preventDefault();
        if (!d.started) {
          d.started = true;
          d.moved = true;
          if (d.longPressTimer != null) {
            clearTimeout(d.longPressTimer);
            d.longPressTimer = null;
          }
          onStartMoveAt(e);
        }
      }}
      onTouchEnd={(e) => {
        const d = touchMoveRef.current;
        touchMoveRef.current = null;
        if (d?.longPressTimer != null) clearTimeout(d.longPressTimer);
        if (d && d.longPressFired && !d.moved) {
          // Long-press sem movimento: trata como tap único (não abre)
          return;
        }
        if (d && !d.longPressFired && !d.moved) {
          // Tap curto: exige duplo toque para abrir no mobile
          e.stopPropagation();
          const now = Date.now();
          if (now - lastTapRef.current < 300) {
            lastTapRef.current = 0;
            onClick();
          } else {
            lastTapRef.current = now;
          }
        }
      }}
      onTouchCancel={() => {
        const d = touchMoveRef.current;
        touchMoveRef.current = null;
        if (d?.longPressTimer != null) clearTimeout(d.longPressTimer);
      }}
    >
      <div className="px-1.5 py-1 text-[11px] font-medium leading-tight break-words whitespace-normal flex items-start gap-1.5">
        <button
          type="button"
          aria-label={isDone ? 'Marcar como pendente' : 'Marcar como concluída'}
          onPointerDown={(e) => { e.stopPropagation(); }}
          onPointerUp={(e) => { e.stopPropagation(); }}
          onClick={(e) => {
            e.stopPropagation();
            if (isHistoricalCompletion) return;
            completeTask(task.id);
          }}
          className={cn(
            'mt-[1px] h-[18px] w-[18px] shrink-0 rounded-full border-2 flex items-center justify-center transition-colors hover:scale-110',
            isDone
              ? 'bg-success border-success text-success-foreground'
              : isRecurring
              ? 'border-recurring hover:bg-recurring/20'
              : 'border-muted-foreground/60 hover:bg-muted'
          )}
        >
          {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
        <span className={cn('min-w-0 flex-1', isDone && 'line-through text-muted-foreground')}>
          {task.dueTime && (
            <span className={cn('mr-1', isDragging ? 'text-primary font-semibold' : 'text-muted-foreground')}>
              {`${minutesToTime(startMin)}–${minutesToTime(startMin + durationMin)}`}
            </span>
          )}
          {task.title}
        </span>
      </div>
      {isDragging && (
        <div className="pointer-events-none absolute right-full top-0 mr-2 z-40 flex flex-col items-end gap-1">
          <div className="rounded-md bg-foreground px-2 py-1 text-[12px] font-bold text-background shadow-xl whitespace-nowrap">
            {minutesToTime(startMin)}
          </div>
          <div className="rounded-md bg-foreground/80 px-2 py-0.5 text-[11px] font-semibold text-background shadow-lg whitespace-nowrap">
            {minutesToTime(startMin + durationMin)}
          </div>
        </div>
      )}
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
  occurrenceDate,
  onOpen,
  onStartDrag,
}: {
  task: Task;
  occurrenceDate: string;
  onOpen: () => void;
  onStartDrag: (pointerOffsetMin: number) => void;
}) {
  const downRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    pointerType: string;
    longPressTimer: number | null;
    longPressFired: boolean;
  } | null>(null);
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const isTouch = e.pointerType === 'touch';
        const state = {
          x: e.clientX,
          y: e.clientY,
          moved: false,
          pointerType: e.pointerType,
          longPressTimer: null as number | null,
          longPressFired: false,
        };
        if (isTouch) {
          state.longPressTimer = window.setTimeout(() => {
            const current = downRef.current;
            if (!current || current.moved) return;
            current.longPressFired = true;
            try { (navigator as any).vibrate?.(15); } catch {}
          }, 420) as unknown as number;
        }
        downRef.current = state;
      }}
      onPointerMove={(e) => {
        const d = downRef.current;
        if (!d || d.moved) return;
        const isTouch = d.pointerType === 'touch';
        const threshold = isTouch ? 12 : 4;
        if (Math.abs(e.clientX - d.x) > threshold || Math.abs(e.clientY - d.y) > threshold) {
          d.moved = true;
          if (d.longPressTimer != null) {
            clearTimeout(d.longPressTimer);
            d.longPressTimer = null;
          }
          if (isTouch && !d.longPressFired) {
            downRef.current = null;
            return;
          }
          onStartDrag(0);
        }
      }}
      onPointerUp={(e) => {
        const d = downRef.current;
        downRef.current = null;
        if (d?.longPressTimer != null) clearTimeout(d.longPressTimer);
        const isTouch = d?.pointerType === 'touch';
        if (d && !d.moved && (!isTouch || d.longPressFired)) {
          e.stopPropagation();
          onOpen();
        }
      }}
      onPointerCancel={() => {
        const d = downRef.current;
        downRef.current = null;
        if (d?.longPressTimer != null) clearTimeout(d.longPressTimer);
      }}
      className={cn(
        'w-full text-left border-l-[3px] rounded-r px-1.5 py-1 text-[11px] truncate cursor-grab active:cursor-grabbing select-none',
        isTaskOverdue(task, occurrenceDate)
          ? 'bg-destructive/15 border-l-destructive text-destructive hover:bg-destructive/20'
          : 'bg-card hover:bg-muted/60'
      )}
      style={{ touchAction: 'pan-y' }}
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
