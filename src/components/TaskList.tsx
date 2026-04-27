import { useEffect, useMemo, useState } from 'react';
import {
  Inbox,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Menu,
  Hash,
  Tag,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { TaskItem } from '@/components/TaskItem';
import { AddTaskForm } from '@/components/AddTaskForm';
import { EmptyState } from '@/components/EmptyState';
import { Task, ViewFilter } from '@/types/task';
import { isToday, parseISO, addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';

interface TaskListProps {
  view: ViewFilter;
  projectId?: string;
  labelId?: string;
}

interface SectionRow {
  id: string;
  name: string;
  position: number;
  is_collapsed: boolean;
}

export function TaskList({ view, projectId, labelId }: TaskListProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useTaskStore((s) => s.projects);
  const labels = useTaskStore((s) => s.labels);
  const updateTask = useTaskStore((s) => s.updateTask);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);

  // Load sections for project view
  useEffect(() => {
    setOrderOverride(null);
    if (view !== 'project' || !projectId) {
      setSections([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('sections')
        .select('id,name,position,is_collapsed')
        .eq('project_id', projectId)
        .order('position');
      if (active && data) {
        setSections(data as SectionRow[]);
        setCollapsedSections(
          Object.fromEntries((data as SectionRow[]).map((s) => [s.id, s.is_collapsed]))
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [view, projectId]);

  const { title, icon: Icon, iconColor, filteredTasks, groupedTasks } = useMemo(() => {
    let title = '';
    let Icon: typeof Inbox = Inbox;
    let iconColor: string | undefined;
    let filtered: Task[] = [];
    let grouped: Record<string, Task[]> | null = null;

    const today = new Date().toISOString().split('T')[0];

    switch (view) {
      case 'inbox': {
        const inbox = projects.find((p) => p.isInbox);
        title = 'Caixa de Entrada';
        Icon = Inbox;
        filtered = tasks.filter((t) => !t.completed && t.projectId === inbox?.id);
        break;
      }

      case 'today':
        title = 'Hoje';
        Icon = CalendarDays;
        filtered = tasks.filter((t) => !t.completed && t.dueDate === today);
        filtered.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
          if (a.dueTime) return -1;
          if (b.dueTime) return 1;
          return 0;
        });
        break;

      case 'upcoming': {
        title = 'Em breve';
        Icon = CalendarRange;
        filtered = tasks.filter((t) => !t.completed && t.dueDate);
        filtered.sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1));

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
        const project = projects.find((p) => p.id === projectId);
        title = project?.name || 'Projeto';
        Icon = Hash;
        iconColor = project?.color;
        filtered = tasks.filter((t) => !t.completed && t.projectId === projectId);
        break;
      }

      case 'label': {
        const label = labels.find((l) => l.id === labelId);
        title = label?.name || 'Etiqueta';
        Icon = Tag;
        iconColor = label?.color;
        filtered = tasks.filter((t) => !t.completed && t.labels.includes(labelId || ''));
        break;
      }
    }

    const topLevel = filtered.filter((t) => !t.parentId);
    return { title, icon: Icon, iconColor, filteredTasks: topLevel, groupedTasks: grouped };
  }, [tasks, view, projectId, labelId, projects, labels]);

  // Group by section for project view
  const projectGrouped = useMemo(() => {
    if (view !== 'project') return null;
    const noSection = filteredTasks.filter((t) => !t.sectionId);
    const bySection: Record<string, Task[]> = {};
    sections.forEach((s) => {
      bySection[s.id] = filteredTasks.filter((t) => t.sectionId === s.id);
    });
    return { noSection, bySection };
  }, [view, sections, filteredTasks]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedTasks = useMemo(() => {
    if (!orderOverride) return filteredTasks;
    const map = new Map(filteredTasks.map((t) => [t.id, t]));
    const ordered: Task[] = [];
    orderOverride.forEach((id) => {
      const t = map.get(id);
      if (t) ordered.push(t);
    });
    // append any new ones not in override
    filteredTasks.forEach((t) => {
      if (!orderOverride.includes(t.id)) ordered.push(t);
    });
    return ordered;
  }, [filteredTasks, orderOverride]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedTasks.map((t) => t.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const newOrder = arrayMove(ids, oldIdx, newIdx);
    setOrderOverride(newOrder);
    // Persist positions
    await Promise.all(
      newOrder.map((id, idx) =>
        supabase.from('tasks').update({ position: idx }).eq('id', id)
      )
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Alternar barra lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2.5">
          <Icon
            className="h-5 w-5"
            style={iconColor ? { color: iconColor } : undefined}
          />
          <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        </div>
        <span className="text-sm text-muted-foreground ml-1">
          {filteredTasks.length} tarefa{filteredTasks.length !== 1 ? 's' : ''}
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
        {projectGrouped ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {/* Tasks without section */}
            <SortableContext items={projectGrouped.noSection.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {projectGrouped.noSection.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </SortableContext>

            {sections.map((s) => {
              const isCollapsed = collapsedSections[s.id];
              const sTasks = projectGrouped.bySection[s.id] || [];
              return (
                <div key={s.id} className="mt-4">
                  <button
                    onClick={() =>
                      setCollapsedSections((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
                    }
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {s.name}
                    <span className="ml-1 text-muted-foreground/60 normal-case font-normal">
                      {sTasks.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <SortableContext items={sTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {sTasks.map((task) => (
                        <TaskItem key={task.id} task={task} />
                      ))}
                    </SortableContext>
                  )}
                </div>
              );
            })}

            {view !== 'completed' && <AddTaskForm defaultProjectId={projectId} />}
          </DndContext>
        ) : groupedTasks ? (
          Object.entries(groupedTasks).map(([group, groupTasks]) => (
            <div key={group} className="mb-4">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 capitalize">
                {group}
              </h3>
              {groupTasks.map((task) => (
                <TaskItem key={task.id} task={task} enableDrag={false} />
              ))}
            </div>
          ))
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {orderedTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </SortableContext>
            {view !== 'completed' && (
              <AddTaskForm
                defaultProjectId={view === 'project' ? projectId : undefined}
                defaultDate={view === 'today' ? new Date().toISOString().split('T')[0] : undefined}
              />
            )}
          </DndContext>
        )}

        {filteredTasks.length === 0 && view !== 'completed' && (
          <EmptyState
            icon={<CheckCircle2 className="h-9 w-9" />}
            title="Tudo limpo por aqui! 🎉"
            description="Adicione uma tarefa para começar a organizar seu dia."
            actionLabel="Adicionar tarefa"
            onAction={() => useQuickAddStore.getState().openQuickAdd({
              defaultProjectId: view === 'project' ? projectId ?? null : null,
              defaultDate: view === 'today' ? new Date().toISOString().split('T')[0] : null,
            })}
          />
        )}
      </div>
    </div>
  );
}
