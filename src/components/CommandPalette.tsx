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
import {
  Inbox,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Settings as SettingsIcon,
  Plus,
  Hash,
  Tag,
  Filter as FilterIcon,
  CheckSquare,
} from 'lucide-react';

export function CommandPalette() {
  const navigate = useNavigate();
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useTaskStore((s) => s.projects);
  const labels = useTaskStore((s) => s.labels);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const openDetail = useTaskDetailStore((s) => s.open);

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const matchedTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return tasks
      .filter((t) => !t.completed && t.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [tasks, query]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar tarefas, projetos, etiquetas ou ações…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>

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

        {matchedTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tarefas">
              {matchedTasks.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`task-${t.id}-${t.title}`}
                  onSelect={() => {
                    setOpen(false);
                    openDetail(t.id);
                  }}
                >
                  <CheckSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="truncate">{t.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projetos">
              {projects
                .filter((p) =>
                  query
                    ? p.name.toLowerCase().includes(query.toLowerCase())
                    : true
                )
                .slice(0, 6)
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

        {labels.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Etiquetas">
              {labels
                .filter((l) =>
                  query ? l.name.toLowerCase().includes(query.toLowerCase()) : true
                )
                .slice(0, 6)
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
