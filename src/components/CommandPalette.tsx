import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useTaskStore } from '@/store/taskStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { supabase } from '@/integrations/supabase/client';
import {
  Inbox,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Settings as SettingsIcon,
  Plus,
  Hash,
  Tag,
  CheckSquare,
  Loader2,
} from 'lucide-react';

type RemoteTask = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  project_id: string | null;
  user_id: string | null;
  due_date: string | null;
};

export function CommandPalette() {
  const navigate = useNavigate();
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const projects = useTaskStore((s) => s.projects);
  const labels = useTaskStore((s) => s.labels);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openDetail = useTaskDetailStore((s) => s.open);

  const [query, setQuery] = useState('');
  const [remoteTasks, setRemoteTasks] = useState<RemoteTask[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setRemoteTasks([]);
    }
  }, [open]);

  // Debounced server search across ALL accessible tasks (own + shared, active + completed)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemoteTasks([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const escaped = q.replace(/[%_,]/g, (m) => `\\${m}`);
      const pattern = `%${escaped}%`;
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, completed, project_id, user_id, due_date')
        .is('deleted_at', null)
        .or(`title.ilike.${pattern},description.ilike.${pattern}`)
        .order('completed', { ascending: true })
        .order('updated_at', { ascending: false })
        .limit(50);
      if (!error) setRemoteTasks((data as RemoteTask[]) || []);
      setSearching(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const projectById = useMemo(() => {
    const m = new Map<string, (typeof projects)[number]>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const { activeTasks, completedTasks } = useMemo(() => {
    const a: RemoteTask[] = [];
    const c: RemoteTask[] = [];
    remoteTasks.forEach((t) => (t.completed ? c.push(t) : a.push(t)));
    return { activeTasks: a, completedTasks: c };
  }, [remoteTasks]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const renderTask = (t: RemoteTask, completed = false) => {
    const proj = t.project_id ? projectById.get(t.project_id) : null;
    return (
      <CommandItem
        key={t.id}
        value={`task-${t.id}-${t.title}`}
        onSelect={() => {
          setOpen(false);
          openDetail(t.id);
        }}
      >
        {completed ? (
          <CheckCircle2 className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
        ) : (
          <CheckSquare className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
        )}
        <span className={`truncate ${completed ? 'line-through text-muted-foreground' : ''}`}>
          {t.title}
        </span>
        {proj && (
          <span className="ml-auto pl-2 text-[10px] text-muted-foreground truncate max-w-[40%]">
            {proj.isInbox ? 'Caixa de Entrada' : proj.name}
          </span>
        )}
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar tudo: tarefas (ativas/concluídas), projetos, etiquetas…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? (
            <span className="flex items-center justify-center gap-2 py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
            </span>
          ) : (
            'Nenhum resultado.'
          )}
        </CommandEmpty>

        <CommandGroup heading="Ações">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              openQuickAdd();
            }}
          >
            <Plus className="h-4 w-4 mr-2 text-primary" />
            Adicionar tarefa
            <span className="ml-auto text-[10px] text-muted-foreground">Q</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegar">
          <CommandItem onSelect={() => go('/inbox')}>
            <Inbox className="h-4 w-4 mr-2" /> Caixa de Entrada
            <span className="ml-auto text-[10px] text-muted-foreground">I</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/today')}>
            <CalendarDays className="h-4 w-4 mr-2" /> Hoje
            <span className="ml-auto text-[10px] text-muted-foreground">T</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/upcoming')}>
            <CalendarRange className="h-4 w-4 mr-2" /> Agenda
            <span className="ml-auto text-[10px] text-muted-foreground">U</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/completed')}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Concluídas
            <span className="ml-auto text-[10px] text-muted-foreground">C</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/settings')}>
            <SettingsIcon className="h-4 w-4 mr-2" /> Configurações
            <span className="ml-auto text-[10px] text-muted-foreground">S</span>
          </CommandItem>
        </CommandGroup>

        {activeTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Tarefas ativas (${activeTasks.length})`}>
              {activeTasks.map((t) => renderTask(t, false))}
            </CommandGroup>
          </>
        )}

        {completedTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Concluídas (${completedTasks.length})`}>
              {completedTasks.map((t) => renderTask(t, true))}
            </CommandGroup>
          </>
        )}

        {projects.length > 0 && query && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projetos">
              {projects
                .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 10)
                .map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`project-${p.id}-${p.name}`}
                    onSelect={() => go(p.isInbox ? '/inbox' : `/projects/${p.id}`)}
                  >
                    {p.isInbox ? (
                      <Inbox className="h-4 w-4 mr-2" />
                    ) : (
                      <Hash className="h-4 w-4 mr-2" style={{ color: p.color }} />
                    )}
                    {p.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}

        {labels.length > 0 && query && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Etiquetas">
              {labels
                .filter((l) => l.name.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 10)
                .map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`label-${l.id}-${l.name}`}
                    onSelect={() => go(`/labels/${l.id}`)}
                  >
                    <Tag className="h-4 w-4 mr-2" style={{ color: l.color }} />
                    {l.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
