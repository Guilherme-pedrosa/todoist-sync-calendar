import { useState } from 'react';
import {
  Calendar,
  Clock,
  Trash2,
  Repeat,
  ChevronRight,
  Flag,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task, Priority } from '@/types/task';
import { useTaskStore } from '@/store/taskStore';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskItemProps {
  task: Task;
}

const priorityColors: Record<Priority, string> = {
  1: 'border-priority-1 text-priority-1',
  2: 'border-priority-2 text-priority-2',
  3: 'border-priority-3 text-priority-3',
  4: 'border-muted-foreground/30 text-muted-foreground/30',
};

const priorityBg: Record<Priority, string> = {
  1: 'bg-priority-1',
  2: 'bg-priority-2',
  3: 'bg-priority-3',
  4: 'bg-muted-foreground/30',
};

function formatDueDate(dateStr: string) {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Hoje';
  if (isTomorrow(date)) return 'Amanhã';
  return format(date, "d 'de' MMM", { locale: ptBR });
}

export function TaskItem({ task }: TaskItemProps) {
  const { toggleTask, deleteTask, projects, labels: allLabels } = useTaskStore();
  const [isHovered, setIsHovered] = useState(false);

  const project = projects.find((p) => p.id === task.projectId);
  const taskLabels = allLabels.filter((l) => task.labels.includes(l.id));
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate)) && !task.completed;
  const subtasks = useTaskStore((s) => s.tasks.filter((t) => t.parentId === task.id));

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-3 py-3 rounded-xl transition-all animate-slide-in',
        'hover:bg-muted/50',
        task.completed && 'opacity-50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Checkbox */}
      <button
        onClick={() => toggleTask(task.id)}
        className={cn(
          'mt-0.5 h-[18px] w-[18px] rounded-full border-2 shrink-0 transition-all flex items-center justify-center',
          priorityColors[task.priority],
          task.completed && [priorityBg[task.priority], 'border-transparent']
        )}
      >
        {task.completed && (
          <svg className="h-2.5 w-2.5 text-primary-foreground animate-check-bounce" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium leading-snug',
            task.completed && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>

        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.dueDate && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                isOverdue ? 'text-destructive' : isToday(parseISO(task.dueDate)) ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatDueDate(task.dueDate)}
              {task.dueTime && (
                <>
                  <Clock className="h-3 w-3 ml-0.5" />
                  {task.dueTime}
                </>
              )}
            </span>
          )}

          {task.recurrence && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Repeat className="h-3 w-3" />
            </span>
          )}

          {project && project.id !== 'inbox' && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </span>
          )}

          {taskLabels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}

          {subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ChevronRight className="h-3 w-3" />
              {subtasks.filter((s) => s.completed).length}/{subtasks.length}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          'flex items-center gap-1 transition-opacity shrink-0',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
      >
        <button
          onClick={() => deleteTask(task.id)}
          className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
