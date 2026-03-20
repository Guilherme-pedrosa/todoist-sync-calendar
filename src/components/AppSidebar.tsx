import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Inbox,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Plus,
  ChevronDown,
  ChevronRight,
  Tag,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const PROJECT_COLORS = [
  'hsl(0, 72%, 51%)',
  'hsl(12, 80%, 55%)',
  'hsl(38, 92%, 50%)',
  'hsl(152, 60%, 42%)',
  'hsl(200, 70%, 50%)',
  'hsl(262, 60%, 55%)',
  'hsl(330, 65%, 50%)',
];

export function AppSidebar() {
  const { signOut, calendarConnected, connectCalendar } = useAuth();
  const {
    tasks,
    projects,
    labels,
    activeView,
    activeProjectId,
    activeLabelId,
    setActiveView,
    setActiveProjectId,
    setActiveLabelId,
    addProject,
    addLabel,
  } = useTaskStore();

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const todayCount = tasks.filter(
    (t) => !t.completed && t.dueDate === today
  ).length;
  const inboxProject = projects.find((p) => p.isInbox);
  const inboxCount = tasks.filter(
    (t) => !t.completed && t.projectId === inboxProject?.id
  ).length;

  const handleAddProject = () => {
    if (newProjectName.trim()) {
      const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
      addProject({ name: newProjectName.trim(), color });
      setNewProjectName('');
      setShowNewProject(false);
    }
  };

  const handleAddLabel = () => {
    if (newLabelName.trim()) {
      const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
      addLabel({ name: newLabelName.trim(), color });
      setNewLabelName('');
      setShowNewLabel(false);
    }
  };

  const handleConnectCalendar = async () => {
    setConnectingCalendar(true);
    try {
      await connectCalendar();
    } finally {
      setConnectingCalendar(false);
    }
  };

  const navItems = [
    {
      icon: Inbox,
      label: 'Caixa de Entrada',
      view: 'inbox' as const,
      count: inboxCount,
    },
    {
      icon: CalendarDays,
      label: 'Hoje',
      view: 'today' as const,
      count: todayCount,
    },
    {
      icon: CalendarRange,
      label: 'Em breve',
      view: 'upcoming' as const,
    },
    {
      icon: CheckCircle2,
      label: 'Concluídas',
      view: 'completed' as const,
    },
  ];

  return (
    <aside className="h-full w-[280px] bg-sidebar text-sidebar-foreground flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-5">
        <h1 className="font-display text-xl font-bold text-sidebar-primary-foreground tracking-tight">
          <span className="text-sidebar-primary">Task</span>Flow
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => setActiveView(item.view)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              activeView === item.view && !activeProjectId && !activeLabelId
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span className="text-xs opacity-60">{item.count}</span>
            )}
          </button>
        ))}

        {/* Projects */}
        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen} className="pt-4">
          <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70">
            {projectsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Projetos
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNewProject(true);
              }}
              className="ml-auto hover:text-sidebar-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 mt-1">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setActiveProjectId(project.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeView === 'project' && activeProjectId === project.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span className="flex-1 text-left truncate">{project.name}</span>
                <span className="text-xs opacity-50">
                  {tasks.filter((t) => !t.completed && t.projectId === project.id).length}
                </span>
              </button>
            ))}
            {showNewProject && (
              <div className="px-3 py-1">
                <Input
                  autoFocus
                  placeholder="Nome do projeto"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddProject();
                    if (e.key === 'Escape') setShowNewProject(false);
                  }}
                  onBlur={() => {
                    if (newProjectName.trim()) handleAddProject();
                    else setShowNewProject(false);
                  }}
                  className="h-8 text-sm bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Labels */}
        <Collapsible open={labelsOpen} onOpenChange={setLabelsOpen} className="pt-2">
          <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70">
            {labelsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Etiquetas
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNewLabel(true);
              }}
              className="ml-auto hover:text-sidebar-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 mt-1">
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() => setActiveLabelId(label.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeView === 'label' && activeLabelId === label.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <Tag className="h-3.5 w-3.5 shrink-0" style={{ color: label.color }} />
                <span className="flex-1 text-left truncate">{label.name}</span>
              </button>
            ))}
            {showNewLabel && (
              <div className="px-3 py-1">
                <Input
                  autoFocus
                  placeholder="Nome da etiqueta"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddLabel();
                    if (e.key === 'Escape') setShowNewLabel(false);
                  }}
                  onBlur={() => {
                    if (newLabelName.trim()) handleAddLabel();
                    else setShowNewLabel(false);
                  }}
                  className="h-8 text-sm bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border space-y-3">
        <div className="flex items-center gap-2 text-xs text-sidebar-foreground/40">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Google Calendar</span>
          <span className={cn(
            'ml-auto px-1.5 py-0.5 rounded text-[10px]',
            calendarConnected
              ? 'bg-sidebar-primary/20 text-sidebar-primary'
              : 'bg-sidebar-accent text-sidebar-foreground/50'
          )}>
            {calendarConnected === null ? '...' : calendarConnected ? 'Conectado' : 'Pendente'}
          </span>
        </div>

        {!calendarConnected && (
          <button
            onClick={handleConnectCalendar}
            disabled={connectingCalendar}
            className="w-full h-8 rounded-md bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium hover:bg-sidebar-accent/80 transition-colors disabled:opacity-60"
          >
            {connectingCalendar ? 'Conectando...' : 'Conectar Google Calendar'}
          </button>
        )}

        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
