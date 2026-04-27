import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { TaskItem } from '@/components/TaskItem';
import { AddTaskForm } from '@/components/AddTaskForm';
import { Task } from '@/types/task';
import { CalendarDays, Menu, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ViewModeToolbar } from '@/components/ViewModeToolbar';
import { useViewPref } from '@/hooks/useViewPref';

export default function TodayPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [viewPref, setViewPref] = useViewPref('today', { mode: 'list', groupBy: 'priority' });

  const today = new Date().toISOString().split('T')[0];

  const { overdue, todayTasks } = useMemo(() => {
    const overdue: Task[] = [];
    const todayTasks: Task[] = [];
    for (const t of tasks) {
      if (t.completed || t.parentId) continue;
      if (!t.dueDate) continue;
      if (t.dueDate < today) overdue.push(t);
      else if (t.dueDate === today) todayTasks.push(t);
    }
    const sortFn = (a: Task, b: Task) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
      return 0;
    };
    overdue.sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1));
    todayTasks.sort(sortFn);
    return { overdue, todayTasks };
  }, [tasks, today]);

  const rescheduleAllOverdue = async () => {
    await Promise.all(overdue.map((t) => updateTask(t.id, { dueDate: today })));
  };

  const total = overdue.length + todayTasks.length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 -ml-1 rounded-md hover:bg-muted transition-colors shrink-0"
          aria-label="Alternar barra lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <CalendarDays className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">Hoje</h2>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground ml-auto shrink-0">
          {total}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 sm:px-4 py-3">
        {overdue.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2 px-2 sm:px-3 py-2">
              <button
                onClick={() => setOverdueOpen((o) => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-destructive hover:opacity-80 transition-opacity"
              >
                {overdueOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <AlertTriangle className="h-4 w-4" />
                Atrasadas
                <span className="text-xs font-normal opacity-70">({overdue.length})</span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                onClick={rescheduleAllOverdue}
                className="ml-auto h-7 text-[11px] text-destructive hover:bg-destructive/10 px-2"
              >
                Reagendar p/ hoje
              </Button>
            </div>
            {overdueOpen && (
              <div className={cn('mt-1')}>
                {overdue.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-2">
          {overdue.length > 0 && (
            <h3 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hoje · {format(new Date(), "d 'de' MMM", { locale: ptBR })}
            </h3>
          )}
          {todayTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>

        <AddTaskForm defaultDate={today} />

        {total === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <CalendarDays className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Tudo limpo por aqui! 🎉</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Adicione uma tarefa para começar o dia
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
