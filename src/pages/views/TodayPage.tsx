import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { TaskItem } from '@/components/TaskItem';
import { AddTaskForm } from '@/components/AddTaskForm';
import { Task } from '@/types/task';
import { CalendarDays, Menu, ChevronDown, ChevronRight, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAIAssistantStore } from '@/store/aiAssistantStore';
import { format, parseISO } from 'date-fns';
import { getHolidayForDate } from '@/lib/holidays';
import { ptBR } from 'date-fns/locale';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ViewModeToolbar } from '@/components/ViewModeToolbar';
import { useViewPref } from '@/hooks/useViewPref';
import { useShowCompleted } from '@/hooks/useShowCompleted';
import { ShowCompletedToggle } from '@/components/ShowCompletedToggle';
import { useAuth } from '@/contexts/AuthContext';
import { expandOccurrencesInRange } from '@/lib/recurrence';

export default function TodayPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const { user } = useAuth();
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [viewPref, setViewPref] = useViewPref('today', { mode: 'list', groupBy: 'priority' });
  const [showCompleted, setShowCompleted] = useShowCompleted('today');

  const today = new Date().toISOString().split('T')[0];

  const { overdue, todayTasks, completedToday } = useMemo(() => {
    const overdue: Task[] = [];
    const todayTasks: Task[] = [];
    const completedToday: Task[] = [];

    const todayStr = new Date().toISOString().split('T')[0];
    const todayDate = new Date(todayStr + 'T00:00:00');
    const futureWindow = new Date(todayDate);
    futureWindow.setDate(futureWindow.getDate() + 30);

    for (const t of tasks) {
      if (t.parentId) continue;
      if (!t.dueDate) continue;
      if (user && t.assigneeIds && t.assigneeIds.length > 0 && !t.assigneeIds.includes(user.id)) {
        continue;
      }
      if (t.completed) {
        if (t.dueDate === todayStr) completedToday.push(t);
        continue;
      }
      if (t.dueDate === todayStr) {
        todayTasks.push(t);
        continue;
      }
      if (t.dueDate < todayStr) {
        // Recorrentes com due_date desalinhado da regra: se a regra prevê
        // ocorrência nos próximos 30 dias, série está viva — esconder do overdue.
        if (t.recurrenceRule) {
          try {
            const futureOccurrences = expandOccurrencesInRange(
              t.recurrenceRule,
              t.dueDate,
              t.dueTime,
              todayDate,
              futureWindow
            );
            if (futureOccurrences && futureOccurrences.length > 0) {
              continue;
            }
          } catch (err) {
            console.warn('[TodayPage] expandOccurrencesInRange failed', {
              taskId: t.id, rule: t.recurrenceRule, err,
            });
          }
        }
        overdue.push(t);
      }
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
    completedToday.sort(sortFn);
    return { overdue, todayTasks, completedToday };
  }, [tasks, user]);

  const rescheduleAllOverdue = async () => {
    await Promise.all(overdue.map((t) => updateTask(t.id, { dueDate: today })));
  };

  const total = overdue.length + todayTasks.length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="hidden lg:inline-flex p-1.5 -ml-1 rounded-md hover:bg-muted transition-colors shrink-0"
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
            {(() => {
              const h = getHolidayForDate(today);
              if (!h) return null;
              return (
                <p
                  className={cn(
                    'text-[11px] sm:text-xs font-semibold mt-0.5 truncate',
                    h.type === 'national' ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  🎉 Feriado: {h.name}
                </p>
              );
            })()}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ShowCompletedToggle
            show={showCompleted}
            onChange={setShowCompleted}
            count={completedToday.length}
          />
          <ViewModeToolbar
            mode={viewPref.mode}
            groupBy={viewPref.groupBy}
            onChangeMode={(m) => setViewPref({ ...viewPref, mode: m })}
            onChangeGroupBy={(g) => setViewPref({ ...viewPref, groupBy: g })}
            groupOptions={['priority', 'label', 'project', 'status']}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => useAIAssistantStore.getState().open('analyze')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">IA</span>
          </Button>
          <span className="text-xs sm:text-sm text-muted-foreground">{total}</span>
        </div>
      </header>

      {viewPref.mode === 'kanban' ? (
        <KanbanBoard
          tasks={[...overdue, ...todayTasks]}
          boardKey="today"
          newTaskDefaults={{ defaultDate: today }}
        />
      ) : (
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

        <AddTaskForm />

        {showCompleted && completedToday.length > 0 && (
          <div className="mt-4">
            <h3 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Concluídas hoje · {completedToday.length}
            </h3>
            <div className="opacity-60">
              {completedToday.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

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
      )}
    </div>
  );
}
