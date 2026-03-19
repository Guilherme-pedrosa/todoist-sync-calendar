import { useMemo } from 'react';
import {
  Inbox,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Menu,
} from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { TaskItem } from '@/components/TaskItem';
import { AddTaskForm } from '@/components/AddTaskForm';
import { Task } from '@/types/task';
import { isToday, isBefore, parseISO, addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function TaskList() {
  const {
    tasks,
    projects,
    labels,
    activeView,
    activeProjectId,
    activeLabelId,
    toggleSidebar,
  } = useTaskStore();

  const { title, icon: Icon, filteredTasks, groupedTasks } = useMemo(() => {
    let title = '';
    let Icon = Inbox;
    let filtered: Task[] = [];
    let grouped: Record<string, Task[]> | null = null;

    const today = new Date().toISOString().split('T')[0];

    switch (activeView) {
      case 'inbox':
        title = 'Caixa de Entrada';
        Icon = Inbox;
        filtered = tasks.filter((t) => !t.completed && t.projectId === 'inbox');
        break;

      case 'today':
        title = 'Hoje';
        Icon = CalendarDays;
        filtered = tasks.filter(
          (t) => !t.completed && t.dueDate && (t.dueDate === today || (isBefore(parseISO(t.dueDate), new Date()) && !t.completed))
        );
        // Sort: overdue first, then by priority, then by time
        filtered.sort((a, b) => {
          if (a.dueDate !== today && b.dueDate === today) return -1;
          if (a.dueDate === today && b.dueDate !== today) return 1;
          if (a.priority !== b.priority) return a.priority - b.priority;
          if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
          return 0;
        });
        break;

      case 'upcoming': {
        title = 'Em breve';
        Icon = CalendarRange;
        filtered = tasks.filter((t) => !t.completed && t.dueDate);
        filtered.sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1));
        
        // Group by date
        grouped = {};
        filtered.forEach((task) => {
          const date = task.dueDate!;
          const dateObj = parseISO(date);
          let key: string;
          if (isToday(dateObj)) key = 'Hoje';
          else if (date === format(addDays(new Date(), 1), 'yyyy-MM-dd')) key = 'Amanhã';
          else key = format(dateObj, "EEEE, d 'de' MMMM", { locale: ptBR });
          
          if (!grouped![key]) grouped![key] = [];
          grouped![key].push(task);
        });
        break;
      }

      case 'completed':
        title = 'Concluídas';
        Icon = CheckCircle2;
        filtered = tasks.filter((t) => t.completed);
        filtered.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
        break;

      case 'project': {
        const project = projects.find((p) => p.id === activeProjectId);
        title = project?.name || 'Projeto';
        Icon = Inbox;
        filtered = tasks.filter((t) => !t.completed && t.projectId === activeProjectId);
        break;
      }

      case 'label': {
        const label = labels.find((l) => l.id === activeLabelId);
        title = label?.name || 'Etiqueta';
        filtered = tasks.filter((t) => !t.completed && t.labels.includes(activeLabelId || ''));
        break;
      }
    }

    // Filter out subtasks (shown under parents)
    const topLevel = filtered.filter((t) => !t.parentId);

    return { title, icon: Icon, filteredTasks: topLevel, groupedTasks: grouped };
  }, [tasks, activeView, activeProjectId, activeLabelId, projects, labels]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2.5">
          <Icon className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        </div>
        <span className="text-sm text-muted-foreground ml-1">
          {filteredTasks.length} tarefa{filteredTasks.length !== 1 ? 's' : ''}
        </span>
      </header>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
        {groupedTasks ? (
          Object.entries(groupedTasks).map(([group, groupTasks]) => (
            <div key={group} className="mb-4">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 capitalize">
                {group}
              </h3>
              {groupTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          ))
        ) : (
          <>
            {filteredTasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </>
        )}

        {activeView !== 'completed' && <AddTaskForm />}

        {filteredTasks.length === 0 && activeView !== 'completed' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Tudo limpo por aqui! 🎉
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Adicione uma tarefa acima para começar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
