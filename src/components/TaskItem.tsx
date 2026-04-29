import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Trash2,
  Repeat,
  ChevronRight,
  ChevronDown,
  Flag,
  GripVertical,
  MoreHorizontal,
  CalendarClock,
  FolderInput,
  Edit3,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task, Priority } from '@/types/task';
import { useTaskStore } from '@/store/taskStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCompleteTask } from '@/hooks/useCompleteTask';
import { useDeleteTaskWithRecurrencePrompt } from '@/hooks/useDeleteTaskWithRecurrencePrompt';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DatePickerPopover, DateValue } from '@/components/DatePickerPopover';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface TaskItemProps {
  task: Task;
  depth?: number;
  enableDrag?: boolean;
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

export function TaskItem({ task, depth = 0, enableDrag = true }: TaskItemProps) {
  const navigate = useNavigate();
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const projects = useTaskStore((s) => s.projects);
  const allLabels = useTaskStore((s) => s.labels);
  const tasks = useTaskStore((s) => s.tasks);
  const openDetail = useTaskDetailStore((s) => s.open);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const complete = useCompleteTask();
  const deleteWithPrompt = useDeleteTaskWithRecurrencePrompt();

  const [collapsed, setCollapsed] = useState(true);

  const project = projects.find((p) => p.id === task.projectId);
  const taskLabels = allLabels.filter((l) => task.labels.includes(l.id));
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate)) && !task.completed;
  const subtasks = tasks.filter((t) => t.parentId === task.id);
  const hasSubtasks = subtasks.length > 0;
  const completedSubs = subtasks.filter((s) => s.completed).length;

  const sortable = useSortable({ id: task.id, disabled: !enableDrag });
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = sortable;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't open detail when clicking on interactive children
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-detail]')) return;
    openDetail(task.id);
  };

  const dateValue: DateValue = {
    date: task.dueDate,
    time: task.dueTime,
    durationMinutes: task.durationMinutes ?? null,
    recurrenceRule: task.recurrenceRule,
  };

  // Calcula horário de fim quando há hora + duração
  const endTime = (() => {
    if (!task.dueTime || !task.durationMinutes) return null;
    const [h, m] = task.dueTime.split(':').map(Number);
    const total = h * 60 + m + task.durationMinutes;
    const nh = Math.floor((total % (24 * 60)) / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'select-none relative overflow-hidden',
        depth > 0 && 'ml-6 pl-4 border-l border-border/60'
      )}
    >
      <motion.div
        drag={!enableDrag ? false : 'x'}
        dragConstraints={{ left: -120, right: 120 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          const w = (info.point.x ? 1 : 1) && 200; // arbitrary base
          if (info.offset.x > 80) {
            // swipe direita → concluir
            complete(task.id);
          } else if (info.offset.x < -80) {
            // swipe esquerda → excluir (com prompt p/ recorrente)
            const snapshot = { ...task };
            void deleteWithPrompt(task.id, { occurrenceDate: task.dueDate ?? undefined }).then((result) => {
              if (result !== 'deleted') return;
              toast('Tarefa excluída', {
                duration: 6000,
                action: {
                  label: 'Desfazer',
                  onClick: async () => {
                    await useTaskStore.getState().addTask({
                      title: snapshot.title,
                      description: snapshot.description,
                      priority: snapshot.priority,
                      dueDate: snapshot.dueDate ?? null,
                      dueTime: snapshot.dueTime ?? null,
                      durationMinutes: snapshot.durationMinutes ?? null,
                      dueString: snapshot.dueString ?? null,
                      deadline: snapshot.deadline ?? null,
                      recurrenceRule: snapshot.recurrenceRule ?? null,
                      projectId: snapshot.projectId ?? null,
                      sectionId: snapshot.sectionId ?? null,
                      parentId: snapshot.parentId ?? null,
                      labels: snapshot.labels,
                      position: 0,
                    } as any);
                  },
                },
              });
            });
          }
        }}
        onClick={handleClick}
        className={cn(
          'group flex items-start gap-2 px-2 py-2 rounded-lg transition-colors cursor-pointer bg-background border-l-2 border-transparent',
          'hover:bg-muted/50',
          task.recurrenceRule && !task.completed && 'border-recurring bg-recurring/5 hover:bg-recurring/10',
          task.completed && 'opacity-50'
        )}
      >
        {/* Drag handle */}
        {enableDrag && (
          <button
            data-no-detail
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing pt-1"
            aria-label="Arrastar"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Subtask collapse */}
        {hasSubtasks ? (
          <button
            data-no-detail
            onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }}
            className="pt-1 text-muted-foreground hover:text-foreground"
            aria-label="Mostrar/esconder subtarefas"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {/* Checkbox */}
        <button
          data-no-detail
          onClick={(e) => { e.stopPropagation(); complete(task.id); }}
          className={cn(
            'mt-0.5 h-[18px] w-[18px] rounded-full border-2 shrink-0 transition-all flex items-center justify-center',
            priorityColors[task.priority],
            task.completed && [priorityBg[task.priority], 'border-transparent']
          )}
          aria-label="Concluir"
        >
          {task.completed && (
            <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-medium leading-snug',
              task.recurrenceRule && !task.completed && 'text-recurring',
              task.completed && 'line-through text-success'
            )}
          >
            {task.taskNumber != null && (
              <span className="text-muted-foreground/70 font-mono text-xs mr-1.5 tabular-nums">
                #{task.taskNumber}
              </span>
            )}
            {task.title}
          </p>

          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {task.dueDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs',
                  isOverdue ? 'text-destructive' : isToday(parseISO(task.dueDate)) ? 'text-success' : 'text-muted-foreground'
                )}
              >
                <Calendar className="h-3 w-3" />
                {formatDueDate(task.dueDate)}
                {task.dueTime && (
                  <>
                    <Clock className="h-3 w-3 ml-0.5" />
                    {endTime ? `${task.dueTime} → ${endTime}` : task.dueTime}
                  </>
                )}
              </span>
            )}

            {task.recurrenceRule && (
              <span className="inline-flex items-center gap-1 text-xs text-recurring">
                <Repeat className="h-3 w-3" />
                Dia útil
              </span>
            )}

            {project && !project.isInbox && (
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

            {hasSubtasks && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="h-3 w-3" />
                {completedSubs}/{subtasks.length}
              </span>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div
          data-no-detail
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          {/* Schedule */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="Agendar"
                title="Agendar"
              >
                <CalendarClock className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end" onClick={(e) => e.stopPropagation()}>
              <DatePickerPopover
                value={dateValue}
                onChange={(v) =>
                  updateTask(task.id, {
                    dueDate: v.date ?? null as any,
                    dueTime: v.time ?? null as any,
                    recurrenceRule: v.recurrenceRule ?? null,
                    durationMinutes: v.durationMinutes ?? null,
                  })
                }
                trigger={<span />}
              />
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="Mais"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => openDetail(task.id)}>
                <Edit3 className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
              {depth < 4 && (
                <DropdownMenuItem
                  onSelect={() => openQuickAdd({ defaultParentId: task.id, defaultProjectId: task.projectId ?? null })}
                >
                  <Plus className="h-4 w-4 mr-2" /> Adicionar subtarefa
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  if (task.projectId) navigate(`/projects/${task.projectId}`);
                }}
              >
                <FolderInput className="h-4 w-4 mr-2" /> Ir para projeto
              </DropdownMenuItem>
              {task.recurrenceRule && !task.completed && (
                <DropdownMenuItem onSelect={() => complete(task.id, { endRecurring: true })}>
                  <Trash2 className="h-4 w-4 mr-2" /> Finalizar recorrência
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={async () => {
                  const snapshot = { ...task };
                  const result = await deleteWithPrompt(task.id, {
                    occurrenceDate: task.dueDate ?? undefined,
                  });
                  if (result !== 'deleted') return;
                  toast('Tarefa excluída', {
                    duration: 6000,
                    action: {
                      label: 'Desfazer',
                      onClick: async () => {
                        // Recria a tarefa
                        await useTaskStore.getState().addTask({
                          title: snapshot.title,
                          description: snapshot.description,
                          priority: snapshot.priority,
                          dueDate: snapshot.dueDate ?? null,
                          dueTime: snapshot.dueTime ?? null,
                          durationMinutes: snapshot.durationMinutes ?? null,
                          dueString: snapshot.dueString ?? null,
                          deadline: snapshot.deadline ?? null,
                          recurrenceRule: snapshot.recurrenceRule ?? null,
                          projectId: snapshot.projectId ?? null,
                          sectionId: snapshot.sectionId ?? null,
                          parentId: snapshot.parentId ?? null,
                          labels: snapshot.labels,
                          position: 0,
                        } as any);
                      },
                    },
                  });
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* Subtasks - aninhadas visualmente dentro do pai */}
      {hasSubtasks && !collapsed && (
        <div className="mt-0.5">
          {subtasks.map((sub) => (
            <TaskItem key={sub.id} task={sub} depth={depth + 1} enableDrag={false} />
          ))}
        </div>
      )}
    </div>
  );
}
