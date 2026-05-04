import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
  Download,
  MoreHorizontal,
  Trash2,
  Search,
  Sparkles,
  Hash,
  Star,
  StarOff,
  Edit2,
  Archive,
  Filter as FilterIcon,
  Settings,
  User as UserIcon,
  RefreshCw,
  Users,
  UsersRound,
  FolderKanban,
  BarChart3,
  FileText,
  Activity,
  Chrome,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useAIAssistantStore } from '@/store/aiAssistantStore';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label as UiLabel } from '@/components/ui/label';
import { ProjectFormDialog } from '@/components/ProjectFormDialog';
import { Project } from '@/types/task';

interface FilterRow {
  id: string;
  name: string;
  query: string;
  color: string;
  is_favorite: boolean;
  position: number;
}

const navLinkClass = (active: boolean) =>
  cn(
    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
  );

const FILTER_PRESETS = [
  { name: 'Atribuídas a mim', query: 'overdue | today' },
  { name: 'Sem data', query: 'no date' },
  { name: 'Prioridade 1', query: 'p1' },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { user, signOut, calendarConnected, connectCalendar, reconnectCalendar, disconnectCalendar } = useAuth();
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useTaskStore((s) => s.projects);
  const labels = useTaskStore((s) => s.labels);
  const fetchData = useTaskStore((s) => s.fetchData);
  const archiveProject = useTaskStore((s) => s.archiveProject);
  const deleteProject = useTaskStore((s) => s.deleteProject);
  const toggleProjectFavorite = useTaskStore((s) => s.toggleProjectFavorite);
  const toggleLabelFavorite = useTaskStore((s) => s.toggleLabelFavorite);
  const deleteLabel = useTaskStore((s) => s.deleteLabel);
  const addLabel = useTaskStore((s) => s.addLabel);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openPalette = useCommandPaletteStore((s) => s.setOpen);

  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [importingTodoist, setImportingTodoist] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectBeingEdited, setProjectBeingEdited] = useState<Project | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{
    id: string;
    name: string;
    taskCount: number;
  } | null>(null);

  // Filters state (DB)
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<{ name: string; query: string }>({ name: '', query: '' });

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('filters')
        .select('id,name,query,color,is_favorite,position')
        .eq('user_id', user.id)
        .order('position');
      if (active && data) setFilters(data as FilterRow[]);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  // Produtividade/Extensão só aparecem para admins do painel de produtividade
  const [isProductivityAdmin, setIsProductivityAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsProductivityAdmin(false); return; }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('productivity_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (active) setIsProductivityAdmin(!!data);
    })();
    return () => { active = false; };
  }, [user]);

  const today = new Date().toISOString().split('T')[0];
  const todayCount = tasks.filter((t) => !t.completed && t.dueDate === today).length;
  const inboxProject = projects.find((p) => p.isInbox);
  const inboxCount = tasks.filter(
    (t) => !t.completed && t.projectId === inboxProject?.id
  ).length;
  const upcomingCount = tasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate > today
  ).length;

  const projectTaskCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.completed || !t.projectId) continue;
      map.set(t.projectId, (map.get(t.projectId) || 0) + 1);
    }
    return map;
  }, [tasks]);

  const rootProjects = useMemo(
    () =>
      projects
        .filter((p) => !p.isInbox && !p.parentId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [projects]
  );
  const childrenOf = (parentId: string) =>
    projects
      .filter((p) => p.parentId === parentId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const favoriteProjects = useMemo(
    () => projects.filter((p) => p.isFavorite && !p.isInbox),
    [projects]
  );
  const favoriteLabels = useMemo(() => labels.filter((l) => l.isFavorite), [labels]);
  const favoriteFilters = useMemo(() => filters.filter((f) => f.is_favorite), [filters]);

  const openCreateProject = (parentId: string | null = null) => {
    setProjectBeingEdited(null);
    setDefaultParentId(parentId);
    setProjectDialogOpen(true);
  };

  const openEditProject = (p: Project) => {
    setProjectBeingEdited(p);
    setDefaultParentId(p.parentId ?? null);
    setProjectDialogOpen(true);
  };

  const handleAddLabel = async () => {
    if (newLabelName.trim()) {
      await addLabel({ name: newLabelName.trim(), color: 'hsl(220, 10%, 50%)' });
      setNewLabelName('');
      setShowNewLabel(false);
    }
  };

  const handleConnectCalendar = async () => {
    setConnectingCalendar(true);
    try { await connectCalendar(); } finally { setConnectingCalendar(false); }
  };
  const handleReconnectCalendar = async () => {
    setConnectingCalendar(true);
    try { await reconnectCalendar(); } finally { setConnectingCalendar(false); }
  };
  const handleDisconnectCalendar = async () => {
    setConnectingCalendar(true);
    try {
      await disconnectCalendar();
      toast.success('Google Calendar desconectado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao desconectar');
    } finally {
      setConnectingCalendar(false);
    }
  };
  const handleForceSyncCalendar = async () => {
    setSyncingCalendar(true);
    const before = useTaskStore.getState().tasks.length;
    try {
      await fetchData();
      const after = useTaskStore.getState().tasks.length;
      const diff = after - before;
      if (diff > 0) {
        toast.success(`Sincronizado: ${diff} novo(s) evento(s) importado(s)`);
      } else {
        toast.success('Calendário sincronizado — tudo em dia');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao sincronizar');
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleImportTodoist = async () => {
    setImportingTodoist(true);
    try {
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('provider', 'todoist')
        .maybeSingle();
      if (!integration) {
        navigate('/settings?tab=integrations');
        throw new Error('Antes de importar, conecte o seu token do Todoist em Configurações → Integrações.');
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/todoist-proxy?action=import-inbox`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Falha ao importar do Todoist');

      const { totalFromTodoist = 0, createdTasks = 0 } = payload;
      toast.success(`Caixa de Entrada importada: ${createdTasks} nova(s) de ${totalFromTodoist} no Todoist`);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao importar do Todoist');
    } finally {
      setImportingTodoist(false);
    }
  };

  const saveFilter = async () => {
    if (!user || !filterDraft.name.trim() || !filterDraft.query.trim()) return;
    const { data, error } = await supabase
      .from('filters')
      .insert({
        user_id: user.id,
        name: filterDraft.name.trim(),
        query: filterDraft.query.trim(),
        color: 'hsl(262, 60%, 55%)',
        position: filters.length,
      })
      .select('id,name,query,color,is_favorite,position')
      .single();
    if (error || !data) {
      toast.error('Falha ao criar filtro');
      return;
    }
    setFilters((prev) => [...prev, data as FilterRow]);
    setFilterDialogOpen(false);
    setFilterDraft({ name: '', query: '' });
    toast.success('Filtro criado');
    navigate(`/filters/${data.id}`);
  };

  const removeFilter = async (id: string) => {
    await supabase.from('filters').delete().eq('id', id);
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleFilterFavorite = async (f: FilterRow) => {
    const next = !f.is_favorite;
    await supabase.from('filters').update({ is_favorite: next }).eq('id', f.id);
    setFilters((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_favorite: next } : x)));
  };

  const renderProjectRow = (project: Project, depth = 0) => {
    const count = projectTaskCount.get(project.id) || 0;
    const subs = childrenOf(project.id);
    return (
      <div key={project.id}>
        <NavLink
          to={`/projects/${project.id}`}
          className={({ isActive }) =>
            cn(
              'group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )
          }
          style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
        >
          <Hash className="h-3.5 w-3.5 shrink-0" style={{ color: project.color }} />
          <span className="flex-1 truncate">{project.name}</span>
          {project.isFavorite && (
            <Star className="h-3 w-3 fill-current text-sidebar-foreground/40 shrink-0" />
          )}
          <span className="text-xs opacity-50 group-hover:hidden tabular-nums">
            {count > 0 ? count : ''}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Ações de ${project.name}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded hover:bg-sidebar-border/60"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => openEditProject(project)}>
                <Edit2 className="h-4 w-4 mr-2" />Editar projeto
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggleProjectFavorite(project.id)}>
                {project.isFavorite ? (
                  <><StarOff className="h-4 w-4 mr-2" />Remover dos favoritos</>
                ) : (
                  <><Star className="h-4 w-4 mr-2" />Adicionar aos favoritos</>
                )}
              </DropdownMenuItem>
              {depth < 2 && (
                <DropdownMenuItem onSelect={() => openCreateProject(project.id)}>
                  <Plus className="h-4 w-4 mr-2" />Adicionar sub-projeto
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  await archiveProject(project.id);
                  toast.success(`Projeto "${project.name}" arquivado`);
                }}
              >
                <Archive className="h-4 w-4 mr-2" />Arquivar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() =>
                  setProjectToDelete({ id: project.id, name: project.name, taskCount: count })
                }
              >
                <Trash2 className="h-4 w-4 mr-2" />Excluir projeto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </NavLink>
        {subs.map((s) => renderProjectRow(s, depth + 1))}
      </div>
    );
  };

  const userInitial = (user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <aside className="h-full w-[280px] bg-sidebar text-sidebar-foreground flex flex-col overflow-hidden">
      {/* Header: avatar menu + logo */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Menu da conta"
              className="h-8 w-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold flex items-center justify-center hover:opacity-90"
            >
              {userInitial}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel className="truncate text-xs">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <Settings className="h-4 w-4 mr-2" />Configurações
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <UserIcon className="h-4 w-4 mr-2" />Conta
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="font-display text-xl font-bold text-sidebar-primary-foreground tracking-tight">
          <span className="text-sidebar-primary">Task</span>Flow
        </h1>
      </div>

      {/* Top actions: Add task + AI */}
      <div className="px-3 pb-2 flex items-center gap-2">
        <button
          onClick={() => openQuickAdd()}
          className="flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
          aria-label="Adicionar tarefa (Q)"
          title="Adicionar tarefa (Q)"
        >
          <Plus className="h-4 w-4" />
          Adicionar tarefa
        </button>
        <button
          onClick={() => useAIAssistantStore.getState().open('chat')}
          aria-label="Assistente IA"
          title="Assistente IA"
          className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-sidebar-accent/40 text-sidebar-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <button
          aria-label="Buscar tarefas, projetos e etiquetas"
          className="w-full h-9 inline-flex items-center gap-2 px-3 rounded-md bg-sidebar-accent/30 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          title="Buscar (Ctrl+K)"
          onClick={() => openPalette(true)}
        >
          <Search className="h-4 w-4" />
          <span>Buscar</span>
          <kbd className="ml-auto text-[10px] bg-sidebar-border/70 px-1.5 py-0.5 rounded">Ctrl K</kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 space-y-0.5">
        <NavLink to="/inbox" className={({ isActive }) => navLinkClass(isActive)}>
          <Inbox className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Caixa de Entrada</span>
          {inboxCount > 0 && <span className="text-xs opacity-60 tabular-nums">{inboxCount}</span>}
        </NavLink>
        <NavLink to="/today" className={({ isActive }) => navLinkClass(isActive)}>
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Hoje</span>
          {todayCount > 0 && <span className="text-xs opacity-60 tabular-nums">{todayCount}</span>}
        </NavLink>
        <NavLink to="/upcoming" className={({ isActive }) => navLinkClass(isActive)}>
          <CalendarRange className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Em breve</span>
          {upcomingCount > 0 && (
            <span className="text-xs opacity-60 tabular-nums">{upcomingCount}</span>
          )}
        </NavLink>
        <NavLink to="/completed" className={({ isActive }) => navLinkClass(isActive)}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Concluídas</span>
        </NavLink>
        <NavLink to="/transkriptor" className={({ isActive }) => navLinkClass(isActive)}>
          <FileText className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Transkriptor</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navLinkClass(isActive)}>
          <Settings className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Configurações</span>
        </NavLink>

        {/* Equipe */}
        <div className="pt-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          Equipe
        </div>
        <NavLink to="/team/members" className={({ isActive }) => navLinkClass(isActive)}>
          <Users className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Membros</span>
        </NavLink>
        <NavLink to="/team/teams" className={({ isActive }) => navLinkClass(isActive)}>
          <UsersRound className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Times</span>
        </NavLink>
        <NavLink to="/team/projects" className={({ isActive }) => navLinkClass(isActive)}>
          <FolderKanban className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Projetos</span>
        </NavLink>
        <NavLink to="/team/workload" className={({ isActive }) => navLinkClass(isActive)}>
          <BarChart3 className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Carga de trabalho</span>
        </NavLink>
        {isProductivityAdmin && (
          <>
            <NavLink to="/produtividade" className={({ isActive }) => navLinkClass(isActive)}>
              <Activity className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Produtividade</span>
            </NavLink>
            <NavLink to="/extensao" className={({ isActive }) => navLinkClass(isActive)}>
              <Chrome className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Extensão Chrome</span>
            </NavLink>
          </>
        )}

        {/* Favorites */}
        {(favoriteProjects.length > 0 || favoriteLabels.length > 0 || favoriteFilters.length > 0) && (
          <Collapsible open={favoritesOpen} onOpenChange={setFavoritesOpen} className="pt-4">
            <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70">
              {favoritesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Favoritos
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 mt-1">
              {favoriteProjects.map((p) => (
                <NavLink
                  key={`fav-${p.id}`}
                  to={`/projects/${p.id}`}
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0" style={{ color: p.color }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs opacity-50 tabular-nums">
                    {projectTaskCount.get(p.id) || ''}
                  </span>
                </NavLink>
              ))}
              {favoriteLabels.map((l) => (
                <NavLink
                  key={`fav-l-${l.id}`}
                  to={`/labels/${l.id}`}
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Tag className="h-3.5 w-3.5 shrink-0" style={{ color: l.color }} />
                  <span className="flex-1 truncate">{l.name}</span>
                </NavLink>
              ))}
              {favoriteFilters.map((f) => (
                <NavLink
                  key={`fav-f-${f.id}`}
                  to={`/filters/${f.id}`}
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <FilterIcon className="h-3.5 w-3.5 shrink-0" style={{ color: f.color }} />
                  <span className="flex-1 truncate">{f.name}</span>
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Projects */}
        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen} className="pt-4">
          <div className="flex items-center group/projects">
            <CollapsibleTrigger className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70">
              {projectsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Meus projetos
            </CollapsibleTrigger>
            <button
              onClick={() => openCreateProject(null)}
              className="opacity-0 group-hover/projects:opacity-100 mr-2 p-1 rounded hover:bg-sidebar-accent/60 hover:text-sidebar-primary transition-all"
              aria-label="Adicionar projeto"
              title="Adicionar projeto"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <CollapsibleContent className="space-y-0.5 mt-1">
            {rootProjects.map((p) => renderProjectRow(p))}
            {rootProjects.length === 0 && (
              <button
                onClick={() => openCreateProject(null)}
                className="w-full px-3 py-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80 text-left"
              >
                + Adicionar primeiro projeto
              </button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Filters */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="pt-2">
          <div className="flex items-center group/filters">
            <CollapsibleTrigger className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70">
              {filtersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Filtros
            </CollapsibleTrigger>
            <button
              onClick={() => setFilterDialogOpen(true)}
              className="opacity-0 group-hover/filters:opacity-100 mr-2 p-1 rounded hover:bg-sidebar-accent/60 hover:text-sidebar-primary transition-all"
              aria-label="Adicionar filtro"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <CollapsibleContent className="space-y-0.5 mt-1">
            {filters.map((f) => (
              <div key={f.id} className="group flex items-center">
                <NavLink
                  to={`/filters/${f.id}`}
                  className={({ isActive }) => cn('flex-1', navLinkClass(isActive))}
                >
                  <FilterIcon className="h-3.5 w-3.5 shrink-0" style={{ color: f.color }} />
                  <span className="flex-1 truncate">{f.name}</span>
                </NavLink>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Ações"
                      className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded hover:bg-sidebar-border/60 mr-1"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="right">
                    <DropdownMenuItem onSelect={() => toggleFilterFavorite(f)}>
                      {f.is_favorite ? (
                        <><StarOff className="h-4 w-4 mr-2" />Remover dos favoritos</>
                      ) : (
                        <><Star className="h-4 w-4 mr-2" />Adicionar aos favoritos</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => removeFilter(f.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {filters.length === 0 && (
              <button
                onClick={() => setFilterDialogOpen(true)}
                className="w-full px-3 py-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80 text-left"
              >
                + Criar filtro
              </button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Labels */}
        <Collapsible open={labelsOpen} onOpenChange={setLabelsOpen} className="pt-2">
          <div className="flex items-center group/labels">
            <CollapsibleTrigger className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70">
              {labelsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Etiquetas
            </CollapsibleTrigger>
            <button
              onClick={() => setShowNewLabel(true)}
              className="opacity-0 group-hover/labels:opacity-100 mr-2 p-1 rounded hover:bg-sidebar-accent/60 hover:text-sidebar-primary transition-all"
              aria-label="Adicionar etiqueta"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <CollapsibleContent className="space-y-0.5 mt-1">
            {labels.map((label) => (
              <div key={label.id} className="group flex items-center">
                <NavLink
                  to={`/labels/${label.id}`}
                  className={({ isActive }) => cn('flex-1', navLinkClass(isActive))}
                >
                  <Tag className="h-3.5 w-3.5 shrink-0" style={{ color: label.color }} />
                  <span className="flex-1 text-left truncate">{label.name}</span>
                </NavLink>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Ações da etiqueta"
                      className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded hover:bg-sidebar-border/60 mr-1"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="right">
                    <DropdownMenuItem onSelect={() => toggleLabelFavorite(label.id)}>
                      {label.isFavorite ? (
                        <><StarOff className="h-4 w-4 mr-2" />Remover dos favoritos</>
                      ) : (
                        <><Star className="h-4 w-4 mr-2" />Adicionar aos favoritos</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => deleteLabel(label.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2 text-xs text-sidebar-foreground/70 hover:text-destructive transition-colors"
          aria-label="Sair da conta"
          title={user?.email ? `Sair (${user.email})` : 'Sair'}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sair</span>
          {user?.email && (
            <span className="ml-auto truncate text-[10px] text-sidebar-foreground/40 max-w-[140px]">
              {user.email}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 text-xs text-sidebar-foreground/40">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Google Calendar</span>
          <span
            className={cn(
              'ml-auto px-1.5 py-0.5 rounded text-[10px]',
              calendarConnected
                ? 'bg-sidebar-primary/20 text-sidebar-primary'
                : 'bg-sidebar-accent text-sidebar-foreground/50'
            )}
          >
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

        {calendarConnected && (
          <div className="flex gap-2">
            <button
              onClick={handleReconnectCalendar}
              disabled={connectingCalendar}
              className="flex-1 h-8 rounded-md bg-sidebar-accent/40 text-sidebar-foreground/70 text-xs font-medium hover:bg-sidebar-accent/70 hover:text-sidebar-foreground transition-colors disabled:opacity-60"
            >
              {connectingCalendar ? '...' : 'Reconectar'}
            </button>
            <button
              onClick={handleDisconnectCalendar}
              disabled={connectingCalendar}
              className="flex-1 h-8 rounded-md bg-transparent border border-sidebar-border text-sidebar-foreground/60 text-xs font-medium hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-60"
            >
              Desconectar
            </button>
          </div>
        )}

        {calendarConnected && (
          <button
            onClick={handleForceSyncCalendar}
            disabled={syncingCalendar}
            className="w-full h-8 flex items-center justify-center gap-2 rounded-md bg-sidebar-accent/40 text-sidebar-foreground/80 text-xs font-medium hover:bg-sidebar-accent/70 hover:text-sidebar-foreground transition-colors disabled:opacity-60"
            title="Forçar sincronização agora"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncingCalendar && 'animate-spin')} />
            {syncingCalendar ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        )}

        <button
          onClick={handleImportTodoist}
          disabled={importingTodoist}
          className="w-full h-8 flex items-center justify-center gap-2 rounded-md bg-sidebar-accent/40 text-sidebar-foreground/80 text-xs font-medium hover:bg-sidebar-accent/70 hover:text-sidebar-foreground transition-colors disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" />
          {importingTodoist ? 'Importando...' : 'Importar Caixa de Entrada (Todoist)'}
        </button>
      </div>

      {/* Project create/edit dialog */}
      <ProjectFormDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={projectBeingEdited}
        defaultParentId={defaultParentId}
        onCreated={(p) => navigate(`/projects/${p.id}`)}
      />

      {/* Filter create dialog */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo filtro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <UiLabel className="text-xs">Nome</UiLabel>
              <Input
                value={filterDraft.name}
                onChange={(e) => setFilterDraft((s) => ({ ...s, name: e.target.value }))}
                placeholder="Ex.: Prioridade alta da semana"
              />
            </div>
            <div>
              <UiLabel className="text-xs">Consulta</UiLabel>
              <Input
                value={filterDraft.query}
                onChange={(e) => setFilterDraft((s) => ({ ...s, query: e.target.value }))}
                placeholder='Ex.: p1 & today | overdue'
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Operadores: <code>&amp;</code> (e), <code>|</code> (ou). Tokens:{' '}
                <code>today</code>, <code>overdue</code>, <code>no date</code>, <code>p1..p4</code>,{' '}
                <code>@etiqueta</code>, <code>#projeto</code>, ou texto livre.
              </p>
            </div>
            <div>
              <UiLabel className="text-xs">Modelos rápidos</UiLabel>
              <div className="flex flex-wrap gap-1 mt-1">
                {FILTER_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setFilterDraft({ name: p.name, query: p.query })}
                    className="text-[11px] px-2 py-1 rounded-full bg-muted hover:bg-muted/70"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFilterDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveFilter}
              disabled={!filterDraft.name.trim() || !filterDraft.query.trim()}
            >
              Criar filtro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir projeto "{projectToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {projectToDelete?.taskCount
                ? `${projectToDelete.taskCount} tarefa(s) deste projeto serão movidas para a Caixa de Entrada. Sub-projetos viram projetos raiz.`
                : 'Este projeto não tem tarefas pendentes. Sub-projetos viram projetos raiz.'}{' '}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!projectToDelete) return;
                try {
                  await deleteProject(projectToDelete.id);
                  toast.success(`Projeto "${projectToDelete.name}" excluído`);
                  navigate('/today');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Falha ao excluir projeto');
                } finally {
                  setProjectToDelete(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
