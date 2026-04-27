import { useEffect, useMemo, useRef, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
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

type Mode = 'list' | 'week';

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
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []); // 0h-23h

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
  // Scroll para 7h ao montar (cada hora ~44px + 36 all-day + 60 header)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * 44;
    }
  }, []);
  return (
    <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
      <div className="min-w-[900px]">
        {/* Day header */}
        <div className="sticky top-0 z-10 grid grid-cols-[60px_repeat(7,1fr)] bg-background border-b border-border">
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
                <div
                  className={cn(
                    'text-lg font-display font-bold',
                    isToday && 'text-primary'
                  )}
                >
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
                  <MiniTaskChip key={t.id} task={t} />
                ))}
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border/40">
            <div className="px-2 py-1 text-[10px] text-muted-foreground/70 text-right pr-3">
              {String(h).padStart(2, '0')}:00
            </div>
            {weekDays.map((day) => {
              const k = format(day, 'yyyy-MM-dd');
              const list = (tasksByDay.get(k) || []).filter((t) => {
                if (!t.dueTime) return false;
                const hour = Number(t.dueTime.slice(0, 2));
                return hour === h;
              });
              return (
                <div
                  key={k + h}
                  className={cn(
                    'border-l border-border min-h-[44px] px-1 py-0.5 space-y-0.5',
                    isSameDay(day, new Date()) && 'bg-primary/[0.03]'
                  )}
                >
                  {list.map((t) => (
                    <MiniTaskChip key={t.id} task={t} showTime />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTaskChip({ task, showTime }: { task: Task; showTime?: boolean }) {
  const project = useTaskStore((s) => s.projects.find((p) => p.id === task.projectId));
  const priorityColor: Record<number, string> = {
    1: 'border-l-priority-1',
    2: 'border-l-priority-2',
    3: 'border-l-priority-3',
    4: 'border-l-muted-foreground/30',
  };
  return (
    <div
      className={cn(
        'border-l-[3px] bg-card hover:bg-muted/60 cursor-pointer rounded-r px-1.5 py-1 transition-colors',
        priorityColor[task.priority]
      )}
      title={task.title}
    >
      <div className="text-[11px] font-medium leading-tight truncate">
        {showTime && task.dueTime && (
          <span className="text-muted-foreground mr-1">{task.dueTime}</span>
        )}
        {task.title}
      </div>
      {project && !project.isInbox && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 truncate">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
          {project.name}
        </div>
      )}
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
