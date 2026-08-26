import { memo, useEffect, useRef, useState } from 'react';
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
  MessageSquare,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task, Priority } from '@/types/task';
import { useTaskStore } from '@/store/taskStore';
import { useCommentsStore } from '@/store/commentsStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCompleteTask } from '@/hooks/useCompleteTask';
import { useDeleteTaskWithRecurrencePrompt } from '@/hooks/useDeleteTaskWithRecurrencePrompt';
import { useUpdateTaskWithRecurrencePrompt } from '@/hooks/useUpdateTaskWithRecurrencePrompt';
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
import { motion, useMotionValue, useTransform } from 'framer-motion';
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

const EMPTY_SUBTASKS: Task[] = [];

/** Media query reativa (sem ler window.innerWidth durante o render). */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

function TaskItemBase({ task, depth = 0, enableDrag = true }: TaskItemProps) {
  const navigate = useNavigate();
  const updateWithPrompt = useUpdateTaskWithRecurrencePrompt();
  const project = useTaskStore((s) => (task.projectId ? s.projectById[task.projectId] : undefined));
  const labelById = useTaskStore((s) => s.labelById);
  const subtasks = useTaskStore((s) => s.childrenByParentId[task.id]) ?? EMPTY_SUBTASKS;
  const openDetail = useTaskDetailStore((s) => s.open);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const complete = useCompleteTask();
  const deleteWithPrompt = useDeleteTaskWithRecurrencePrompt();
  const unreadComments = useCommentsStore((s) => s.unreadByTask[task.id] || 0);

  const [collapsed, setCollapsed] = useState(true);
  // Conteúdo dos menus só é instanciado após o primeiro clique no gatilho.
  const [scheduleMounted, setScheduleMounted] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);

  const taskLabels = task.labels.map((id) => labelById[id]).filter(Boolean);
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate)) && !task.completed;
  const hasSubtasks = subtasks.length > 0;
  const completedSubs = subtasks.filter((s) => s.completed).length;

  const isDesktop = useIsDesktop();
  const dragEnabled = enableDrag && isDesktop;

  const sortable = useSortable({ id: task.id, disabled: !dragEnabled });
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = sortable;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };


  // ---- Swipe: feedback visual + limiares ----
  const rowRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const dragStartXRef = useRef(0);
  const movedRef = useRef(0);
  const hapticFiredRef = useRef(false);
  const COMPLETE_THRESHOLD = 80;
  /**
   * Excluir exige 45% da largura da linha (mín. 120px, máx. 150px para
   * continuar alcançável dentro do dragConstraints de 160px).
   * Fonte de verdade única: medida no mount/resize e usada tanto no
   * feedback visual quanto na decisão do onDragEnd.
   */
  const [deleteThreshold, setDeleteThreshold] = useState(120);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth || 320;
      setDeleteThreshold(Math.min(150, Math.max(120, w * 0.45)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enableDrag]);

  // Até cruzar o limiar o fundo vai no máximo a 60%; ao cruzar, 100%.
  const completeOpacity = useTransform(
    x,
    [0, COMPLETE_THRESHOLD - 1, COMPLETE_THRESHOLD],
    [0, 0.6, 1]
  );
  const deleteOpacity = useTransform(
    x,
    [-deleteThreshold, -(deleteThreshold - 1), 0],
    [1, 0.6, 0]
  );

  const handleClick = (e: React.MouseEvent) => {
    // Um arrasto (>8px) não deve abrir o detalhe
    if (movedRef.current > 8) {
      movedRef.current = 0;
      return;
    }
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
        depth > 0 && 'ml-3 pl-2 sm:ml-6 sm:pl-4 border-l border-border/60'
      )}
    >
      {/* Fundo de feedback do swipe */}
      {enableDrag && (
        <>
          <motion.div
            aria-hidden
            style={{ opacity: completeOpacity }}
            className="pointer-events-none absolute inset-0 rounded-xl sm:rounded-lg bg-success/20 flex items-center justify-start px-4 text-success"
          >
            <Check className="h-5 w-5" />
          </motion.div>
          <motion.div
            aria-hidden
            style={{ opacity: deleteOpacity }}
            className="pointer-events-none absolute inset-0 rounded-xl sm:rounded-lg bg-destructive/20 flex items-center justify-end px-4 text-destructive"
          >
            <Trash2 className="h-5 w-5" />
          </motion.div>
        </>
      )}
      <motion.div
        ref={rowRef}
        drag={!enableDrag ? false : 'x'}
        dragDirectionLock
        dragSnapToOrigin
        dragConstraints={{ left: -160, right: 160 }}
        dragElastic={0.2}
        style={{ x }}
        onDragStart={() => {
          dragStartXRef.current = x.get();
          movedRef.current = 0;
          hapticFiredRef.current = false;
        }}
        onDrag={(_, info) => {
          movedRef.current = Math.max(movedRef.current, Math.abs(info.offset.x));
          const crossed =
            info.offset.x > COMPLETE_THRESHOLD || info.offset.x < -deleteThreshold;
          if (crossed && !hapticFiredRef.current) {
            hapticFiredRef.current = true;
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(12);
            }
          } else if (!crossed) {
            hapticFiredRef.current = false;
          }
        }}
        onDragEnd={(_, info) => {
          if (info.offset.x > COMPLETE_THRESHOLD) {
            // swipe direita → concluir
            complete(task.id);
          } else if (info.offset.x < -deleteThreshold) {
            // swipe esquerda → excluir (com prompt p/ recorrente)
            const snapshot = { ...task };
            void deleteWithPrompt(task.id, { occurrenceDate: task.dueDate ?? undefined }).then((result) => {
              if (result !== 'deleted') return;
              toast('Tarefa excluída', {
                duration: 10000,
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
          'touch-pan-y group flex items-start gap-2.5 sm:gap-2 px-2 py-3 sm:py-2 rounded-xl sm:rounded-lg transition-colors cursor-pointer bg-background border-l-2 border-transparent',
          'hover:bg-muted/50',
          task.recurrenceRule && !task.completed && 'border-recurring bg-recurring/5 hover:bg-recurring/10',
          task.completed && 'opacity-50',
          task.pending && 'opacity-70'

        )}
      >
        {/* Drag handle */}
        {enableDrag && (
          <button
            data-no-detail
            {...attributes}
            {...listeners}
            className="hidden md:flex h-8 w-6 items-center justify-center opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground"
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
            className="h-8 w-8 sm:h-6 sm:w-5 -ml-1 flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Mostrar/esconder subtarefas"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="hidden sm:block w-3.5" />
        )}

        {/* Checkbox */}
        <button
          data-no-detail
          onClick={(e) => { e.stopPropagation(); complete(task.id); }}
          className={cn(
            'mt-0.5 h-7 w-7 sm:h-[22px] sm:w-[22px] rounded-full border-2 shrink-0 transition-all flex items-center justify-center hover:scale-110',
            priorityColors[task.priority],
            task.completed && [priorityBg[task.priority], 'border-transparent']
          )}
          aria-label="Concluir"
        >
          {task.completed && (
            <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-[15px] sm:text-sm font-medium leading-snug',
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

            {unreadComments > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary"
                title={`${unreadComments} novo${unreadComments > 1 ? 's' : ''} comentário${unreadComments > 1 ? 's' : ''}`}
              >
                <MessageSquare className="h-3 w-3" />
                {unreadComments}
              </span>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div
          data-no-detail
          className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
        >
          {/* Schedule */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); setScheduleMounted(true); }}
                className="h-10 w-10 sm:h-7 sm:w-7 inline-flex items-center justify-center rounded-lg sm:rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="Agendar"
                title="Agendar"
              >
                <CalendarClock className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
              </button>
            </PopoverTrigger>
            {scheduleMounted && (
              <PopoverContent className="w-auto p-0" align="end" onClick={(e) => e.stopPropagation()}>
                <DatePickerPopover
                  value={dateValue}
                  onChange={(v) =>
                    updateWithPrompt(
                      task.id,
                      {
                        dueDate: v.date ?? null as any,
                        dueTime: v.time ?? null as any,
                        recurrenceRule: v.recurrenceRule ?? null,
                        durationMinutes: v.durationMinutes ?? null,
                      },
                      { occurrenceDate: task.dueDate ?? undefined, changeLabel: 'data e horário' }
                    )
                  }
                  trigger={<span />}
                />
              </PopoverContent>
            )}
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuMounted(true); }}
                className="h-10 w-10 sm:h-7 sm:w-7 inline-flex items-center justify-center rounded-lg sm:rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="Mais"
              >
                <MoreHorizontal className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5" />
              </button>
            </DropdownMenuTrigger>
            {menuMounted && (
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
                    duration: 10000,
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
            )}
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

function sameLabels(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const TaskItem = memo(TaskItemBase, (prev, next) => {
  if (prev.depth !== next.depth || prev.enableDrag !== next.enableDrag) return false;
  const a = prev.task;
  const b = next.task;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.completed === b.completed &&
    a.priority === b.priority &&
    a.dueDate === b.dueDate &&
    a.dueTime === b.dueTime &&
    a.durationMinutes === b.durationMinutes &&
    a.recurrenceRule === b.recurrenceRule &&
    a.projectId === b.projectId &&
    a.description === b.description &&
    a.taskNumber === b.taskNumber &&
    a.parentId === b.parentId &&
    sameLabels(a.labels, b.labels)
  );
});

