import { useMemo } from 'react';
import { Inbox, Menu } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { TaskList } from '@/components/TaskList';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ViewModeToolbar } from '@/components/ViewModeToolbar';
import { useViewPref } from '@/hooks/useViewPref';

export default function InboxPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useTaskStore((s) => s.projects);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const [viewPref, setViewPref] = useViewPref('inbox', { mode: 'list', groupBy: 'priority' });

  const inboxProject = useMemo(() => projects.find((p) => p.isInbox), [projects]);
  const inboxTasks = useMemo(
    () => tasks.filter((t) => !t.completed && !t.parentId && t.projectId === inboxProject?.id),
    [tasks, inboxProject?.id]
  );

  if (viewPref.mode !== 'kanban') {
    // Lista: mantém o componente original com header/contadores/etc.
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-end px-4 sm:px-6 pt-3">
          <ViewModeToolbar
            mode={viewPref.mode}
            groupBy={viewPref.groupBy}
            onChangeMode={(m) => setViewPref({ ...viewPref, mode: m })}
            onChangeGroupBy={(g) => setViewPref({ ...viewPref, groupBy: g })}
            groupOptions={['priority', 'label', 'project', 'status']}
          />
        </div>
        <TaskList view="inbox" />
      </div>
    );
  }

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
          <Inbox className="h-5 w-5 shrink-0" />
          <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">Caixa de Entrada</h2>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ViewModeToolbar
            mode={viewPref.mode}
            groupBy={viewPref.groupBy}
            onChangeMode={(m) => setViewPref({ ...viewPref, mode: m })}
            onChangeGroupBy={(g) => setViewPref({ ...viewPref, groupBy: g })}
            groupOptions={['priority', 'label', 'project', 'status']}
          />
          <span className="text-xs sm:text-sm text-muted-foreground">{inboxTasks.length}</span>
        </div>
      </header>
      <KanbanBoard
        tasks={inboxTasks}
        boardKey="inbox"
        newTaskDefaults={{ projectId: inboxProject?.id }}
      />
    </div>
  );
}
