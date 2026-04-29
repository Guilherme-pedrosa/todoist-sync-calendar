import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutList, KanbanSquare, ArrowDownAZ, Hash, Trash2, Archive, FolderInput, Edit3, MoreHorizontal, Menu, Share2 } from 'lucide-react';
import { TaskList } from '@/components/TaskList';
import { useTaskStore } from '@/store/taskStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { TaskItem } from '@/components/TaskItem';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { ProjectAccessDialog } from '@/components/ProjectAccessDialog';
import { supabase } from '@/integrations/supabase/client';
import { Task } from '@/types/task';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { KanbanBoard } from '@/components/KanbanBoard';

type SortBy = 'manual' | 'date' | 'priority' | 'alpha' | 'added';

interface SectionRow {
  id: string;
  name: string;
  position: number;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const projects = useTaskStore((s) => s.projects);
  const tasks = useTaskStore((s) => s.tasks);
  const labels = useTaskStore((s) => s.labels);
  const updateProject = useTaskStore((s) => s.updateProject);
  const archiveProject = useTaskStore((s) => s.archiveProject);
  const deleteProject = useTaskStore((s) => s.deleteProject);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);

  const project = projects.find((p) => p.id === projectId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const projectWorkspace = workspaces.find((w) => w.id === project?.workspaceId);

  const [view, setView] = useState<'list' | 'board'>(
    (project?.viewType as 'list' | 'board') || 'list'
  );
  const [sortBy, setSortBy] = useState<SortBy>('manual');
  const [labelFilter, setLabelFilter] = useState<string>('all');
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (project?.viewType === 'board' || project?.viewType === 'list') {
      setView(project.viewType);
    }
  }, [project?.viewType]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('sections')
        .select('id,name,position')
        .eq('project_id', projectId)
        .order('position');
      if (active && data) setSections(data as SectionRow[]);
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  const projectTasks = useMemo(() => {
    let list = tasks.filter(
      (t) => !t.completed && t.projectId === projectId && !t.parentId
    );
    if (labelFilter !== 'all') {
      list = list.filter((t) => t.labels.includes(labelFilter));
    }
    if (sortBy === 'date') {
      list = [...list].sort((a, b) => (a.dueDate || 'z') > (b.dueDate || 'z') ? 1 : -1);
    } else if (sortBy === 'priority') {
      list = [...list].sort((a, b) => a.priority - b.priority);
    } else if (sortBy === 'alpha') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'added') {
      list = [...list].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    }
    return list;
  }, [tasks, projectId, labelFilter, sortBy]);

  const handleViewChange = async (newView: 'list' | 'board') => {
    setView(newView);
    if (project) await updateProject(project.id, { viewType: newView });
  };

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Projeto não encontrado
      </div>
    );
  }

  // List view: delega ao TaskList existente (mantém sections + drag), mas com header customizado
  if (view === 'list') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ProjectHeader
          project={project}
          view={view}
          sortBy={sortBy}
          labelFilter={labelFilter}
          labels={labels}
          onViewChange={handleViewChange}
          onSortChange={setSortBy}
          onLabelFilterChange={setLabelFilter}
          onArchive={async () => {
            await archiveProject(project.id);
            toast.success('Projeto arquivado');
            navigate('/today');
          }}
          onDelete={() => setConfirmDelete(true)}
          onEdit={() => toast.info('Editar projeto: use o menu da barra lateral')}
          onShare={() => setShareOpen(true)}
          onToggleSidebar={toggleSidebar}
        />
        <div className="flex-1 overflow-hidden">
          <TaskList view="project" projectId={projectId} />
        </div>
        <DeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onConfirm={async () => {
            await deleteProject(project.id);
            toast.success('Projeto excluído');
            navigate('/today');
          }}
        />
        {project.workspaceId && (
          <ProjectAccessDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            projectId={project.id}
            workspaceId={project.workspaceId}
            visibility={project.visibility ?? 'private'}
            ownerId={project.ownerId ?? null}
            isPersonalWorkspace={!!projectWorkspace?.isPersonal}
          />
        )}
      </div>
    );
  }

  // Board (Kanban) view — usa KanbanBoard genérico com agrupamento configurável
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        view={view}
        sortBy={sortBy}
        labelFilter={labelFilter}
        labels={labels}
        onViewChange={handleViewChange}
        onSortChange={setSortBy}
        onLabelFilterChange={setLabelFilter}
        onArchive={async () => {
          await archiveProject(project.id);
          toast.success('Projeto arquivado');
          navigate('/today');
        }}
        onDelete={() => setConfirmDelete(true)}
        onEdit={() => toast.info('Editar projeto: use o menu da barra lateral')}
        onShare={() => setShareOpen(true)}
        onToggleSidebar={toggleSidebar}
      />

      <KanbanBoard
        tasks={projectTasks}
        boardKey={`project:${projectId}`}
        projectId={projectId}
        sections={sections.map((s) => ({ ...s, projectId: projectId! }))}
        newTaskDefaults={{ projectId }}
      />

      <DeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={async () => {
          await deleteProject(project.id);
          toast.success('Projeto excluído');
          navigate('/today');
        }}
      />
      {project.workspaceId && (
        <ProjectAccessDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          projectId={project.id}
          workspaceId={project.workspaceId}
          visibility={project.visibility ?? 'private'}
          ownerId={project.ownerId ?? null}
          isPersonalWorkspace={!!projectWorkspace?.isPersonal}
        />
      )}
    </div>
  );
}

function Column({
  title,
  tasks,
  onAdd,
}: {
  title: string;
  tasks: Task[];
  onAdd: () => void;
}) {
  return (
    <div className="w-72 shrink-0 bg-muted/30 rounded-xl flex flex-col max-h-full">
      <div className="px-3 py-2 flex items-center justify-between border-b border-border/50">
        <p className="text-xs font-display font-semibold uppercase tracking-wider">
          {title}
          <span className="ml-2 text-muted-foreground/70 font-normal">{tasks.length}</span>
        </p>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {tasks.map((t) => (
          <div key={t.id} className="bg-background rounded-lg shadow-sm">
            <TaskItem task={t} enableDrag={false} />
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Vazio</p>
        )}
      </div>
      <button
        onClick={onAdd}
        className="text-xs text-muted-foreground hover:text-foreground p-2 border-t border-border/50 hover:bg-muted/50"
      >
        + Adicionar tarefa
      </button>
    </div>
  );
}

function ProjectHeader({
  project,
  view,
  sortBy,
  labelFilter,
  labels,
  onViewChange,
  onSortChange,
  onLabelFilterChange,
  onArchive,
  onDelete,
  onEdit,
  onShare,
  onToggleSidebar,
}: any) {
  return (
    <header className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-border/50">
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-1.5 rounded-md hover:bg-muted"
        aria-label="Alternar barra lateral"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Hash className="h-5 w-5" style={{ color: project.color }} />
      <h2 className="font-display text-xl font-bold tracking-tight mr-2">{project.name}</h2>

      <div className="ml-auto flex items-center gap-2 flex-wrap">
        {/* Filtro etiqueta */}
        <Select value={labelFilter} onValueChange={onLabelFilterChange}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Etiquetas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas etiquetas</SelectItem>
            {labels.map((l: any) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Ordenar */}
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="h-8 text-xs w-32">
            <ArrowDownAZ className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="date">Data</SelectItem>
            <SelectItem value="priority">Prioridade</SelectItem>
            <SelectItem value="alpha">Alfabética</SelectItem>
            <SelectItem value="added">Adicionada</SelectItem>
          </SelectContent>
        </Select>

        {/* Toggle Lista/Quadro */}
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => onViewChange('list')}
            className={cn(
              'h-8 px-2 text-xs flex items-center gap-1',
              view === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
          >
            <LayoutList className="h-3.5 w-3.5" /> Lista
          </button>
          <button
            onClick={() => onViewChange('board')}
            className={cn(
              'h-8 px-2 text-xs flex items-center gap-1',
              view === 'board' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
          >
            <KanbanSquare className="h-3.5 w-3.5" /> Quadro
          </button>
        </div>

        <Button
          variant="default"
          size="sm"
          className="h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          onClick={onShare}
        >
          <Share2 className="h-3.5 w-3.5" /> Compartilhar
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Edit3 className="h-4 w-4 mr-2" /> Editar projeto
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive}>
              <Archive className="h-4 w-4 mr-2" /> Arquivar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Todas as tarefas dentro do projeto também serão removidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Sim, excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
