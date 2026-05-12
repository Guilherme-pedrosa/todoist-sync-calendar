import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';

interface Props {
  /** projectId — usado para resolver o workspace do projeto */
  projectId?: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  /** Se true, aceita só 1 responsável (single-select) */
  single?: boolean;
  /** Texto exibido quando vazio e no plural (default: Responsável/responsáveis) */
  placeholder?: string;
  pluralLabel?: (count: number) => string;
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export function AssigneeChip({ projectId, value, onChange, single, placeholder, pluralLabel }: Props) {
  const projects = useTaskStore((s) => s.projects);
  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );
  const projectWorkspaceId = (project as any)?.workspaceId as string | undefined;

  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open && projectWorkspaceId && projectWorkspaceId !== membersWorkspaceId) {
      void fetchMembers(projectWorkspaceId);
    }
  }, [open, projectWorkspaceId, membersWorkspaceId, fetchMembers]);

  const visibleMembers = useMemo(() => {
    if (!projectWorkspaceId) return [];
    if (membersWorkspaceId !== projectWorkspaceId) return [];
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (!q) return true;
      return (
        (m.displayName || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      );
    });
  }, [members, membersWorkspaceId, projectWorkspaceId, query]);

  const selectedMembers = useMemo(
    () => value.map((id) => members.find((m) => m.userId === id)).filter(Boolean) as typeof members,
    [value, members]
  );

  const toggle = (uid: string) => {
    if (single) {
      onChange(value.includes(uid) ? [] : [uid]);
      setOpen(false);
      return;
    }
    onChange(
      value.includes(uid) ? value.filter((id) => id !== uid) : [...value, uid]
    );
  };

  const filled = value.length > 0;
  const emptyLabel = placeholder || 'Responsável';
  const label =
    selectedMembers.length === 0
      ? emptyLabel
      : selectedMembers.length === 1
        ? (selectedMembers[0].displayName || selectedMembers[0].email || emptyLabel)
        : (pluralLabel ? pluralLabel(selectedMembers.length) : `${selectedMembers.length} responsáveis`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors max-w-[180px]',
            filled
              ? 'border-primary/40 text-primary bg-primary/5'
              : 'border-border text-muted-foreground hover:border-primary/30'
          )}
        >
          {selectedMembers.length === 1 ? (
            <Avatar className="h-4 w-4">
              <AvatarImage src={selectedMembers[0].avatarUrl || undefined} />
              <AvatarFallback className="text-[8px]">
                {getInitials(selectedMembers[0].displayName || selectedMembers[0].email)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserPlus className="h-3.5 w-3.5" />
          )}
          <span className="truncate">{label}</span>
          {filled && (
            <X
              className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange([]);
              }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {!projectWorkspaceId ? (
          <div className="p-3 text-xs text-muted-foreground">
            Selecione um projeto primeiro.
          </div>
        ) : visibleMembers.length === 0 && membersWorkspaceId === projectWorkspaceId ? (
          <div className="p-3 text-xs text-muted-foreground">
            Este workspace não tem outros membros.
          </div>
        ) : (
          <>
            <div className="p-2 border-b">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar membro…"
                className="h-7 text-xs"
              />
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {visibleMembers.map((m) => {
                const selected = value.includes(m.userId);
                return (
                  <button
                    key={m.userId}
                    onClick={() => toggle(m.userId)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left',
                      selected ? 'bg-muted' : 'hover:bg-muted'
                    )}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={m.avatarUrl || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {getInitials(m.displayName || m.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">
                        {m.displayName || m.email || 'Sem nome'}
                      </div>
                      {m.displayName && m.email && (
                        <div className="truncate text-[10px] text-muted-foreground">
                          {m.email}
                        </div>
                      )}
                    </div>
                    {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
