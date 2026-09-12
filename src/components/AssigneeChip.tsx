import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { UserPlus, Check, X, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisibleViewport } from '@/hooks/useVisibleViewport';

interface Props {
  /** projectId — usado para resolver o workspace do projeto */
  projectId?: string | null;
  value: string[];
  onChange: (ids: string[]) => void | Promise<void>;
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
  const isMobile = useIsMobile();
  const projects = useTaskStore((s) => s.projects);
  const projectWorkspaceId = projects.find((project) => project.id === projectId)?.workspaceId;
  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const loadingMembers = useWorkspaceStore((s) => s.loadingMembers);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewport = useVisibleViewport(open && isMobile);

  useEffect(() => {
    if (open && projectWorkspaceId && projectWorkspaceId !== membersWorkspaceId) {
      void fetchMembers(projectWorkspaceId);
    }
  }, [open, projectWorkspaceId, membersWorkspaceId, fetchMembers]);

  const workspaceMembers = useMemo(
    () => projectWorkspaceId && membersWorkspaceId === projectWorkspaceId ? members : [],
    [members, membersWorkspaceId, projectWorkspaceId]
  );
  const visibleMembers = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return workspaceMembers.filter((member) => !q ||
      (member.displayName || '').toLocaleLowerCase('pt-BR').includes(q) ||
      (member.email || '').toLocaleLowerCase('pt-BR').includes(q)
    );
  }, [workspaceMembers, query]);
  const selectedMembers = workspaceMembers.filter((member) => value.includes(member.userId));

  const changeOpen = (next: boolean) => {
    if (next) {
      setQuery('');
      // Release the task title's keyboard before opening the mobile picker.
      if (isMobile && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    setOpen(next);
  };

  const changeSelection = async (next: string[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onChange(next);
      if (single) setOpen(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggle = (uid: string) => {
    void changeSelection(single
      ? value.includes(uid) ? [] : [uid]
      : value.includes(uid) ? value.filter((id) => id !== uid) : [...value, uid]
    );
  };

  const filled = value.length > 0;
  const emptyLabel = placeholder || 'Responsável';
  const countLabel = pluralLabel ? pluralLabel(value.length) : `${value.length} ${value.length === 1 ? 'responsável' : 'responsáveis'}`;
  const label = value.length === 0
    ? emptyLabel
    : value.length === 1 && selectedMembers[0]
      ? selectedMembers[0].displayName || selectedMembers[0].email || countLabel
      : countLabel;
  const loading = !!projectWorkspaceId && (loadingMembers || membersWorkspaceId !== projectWorkspaceId);

  const trigger = (
    <button
      type="button"
      aria-label={`${emptyLabel}: ${label}`}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors md:max-w-[180px]',
        isMobile ? 'min-h-11 text-sm' : 'text-xs',
        filled ? 'border-primary/40 text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/30'
      )}
    >
      {selectedMembers.length === 1 ? (
        <Avatar className="h-4 w-4 shrink-0">
          <AvatarImage src={selectedMembers[0].avatarUrl || undefined} />
          <AvatarFallback className="text-[8px]">{getInitials(selectedMembers[0].displayName || selectedMembers[0].email)}</AvatarFallback>
        </Avatar>
      ) : <UserPlus className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
      {filled && !isMobile && (
        <X
          className="h-3 w-3 ml-0.5 shrink-0 opacity-60 hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void changeSelection([]);
          }}
        />
      )}
    </button>
  );

  const memberPicker = (
    <>
      {/* Keep this mounted when a search has no matches, so the user can correct it. */}
      <div className={cn('shrink-0 border-b', isMobile ? 'px-4 pb-3' : 'p-2')}>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar membro…"
          aria-label="Buscar membro"
          autoComplete="off"
          autoCorrect="off"
          className={isMobile ? 'h-12 text-base' : 'h-7 text-xs'}
        />
      </div>
      <div className={cn('min-h-0 overflow-y-auto overscroll-contain', isMobile ? 'flex-1 p-2' : 'max-h-60 p-1')} aria-busy={loading || saving}>
        {!projectWorkspaceId ? (
          <p className="p-3 text-sm text-muted-foreground" role="status">Selecione um projeto primeiro.</p>
        ) : loading ? (
          <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Carregando membros…</p>
        ) : visibleMembers.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground" role="status">
            {query.trim() ? 'Nenhum membro encontrado. Tente outro nome.' : 'Este workspace não tem membros disponíveis.'}
          </p>
        ) : visibleMembers.map((member) => {
          const selected = value.includes(member.userId);
          return (
            <button
              type="button"
              key={member.userId}
              onClick={() => toggle(member.userId)}
              disabled={saving}
              aria-pressed={selected}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg text-left disabled:opacity-60',
                isMobile ? 'min-h-14 px-3 py-2 text-sm' : 'px-2 py-1.5 text-xs',
                selected ? 'bg-muted' : 'hover:bg-muted active:bg-muted'
              )}
            >
              <Avatar className={isMobile ? 'h-9 w-9 shrink-0' : 'h-6 w-6 shrink-0'}>
                <AvatarImage src={member.avatarUrl || undefined} />
                <AvatarFallback className={isMobile ? 'text-xs' : 'text-[10px]'}>{getInitials(member.displayName || member.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{member.displayName || member.email || 'Sem nome'}</div>
                {member.displayName && member.email && <div className="truncate text-xs text-muted-foreground">{member.email}</div>}
              </div>
              {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </>
  );

  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">{memberPicker}</PopoverContent>
      </Popover>
    );
  }

  const topGap = Math.min(64, viewport.height * 0.1);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-black/40" />
        <DialogPrimitive.Content
          ref={contentRef}
          className="fixed inset-x-0 z-[130] flex min-h-0 flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl outline-none"
          style={{ top: viewport.top + topGap, height: viewport.height - topGap }}
          onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus(); }}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <DialogPrimitive.Title className="text-base font-semibold">{placeholder || 'Responsáveis'}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground active:bg-muted" aria-label="Fechar seleção">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Busque e selecione os membros do projeto.</DialogPrimitive.Description>
          {memberPicker}
          <div className="flex shrink-0 items-center gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" className="h-11" disabled={!filled || saving} onClick={() => void changeSelection([])}>Limpar</Button>
            <span className="sr-only" role="status">{saving ? 'Salvando seleção…' : countLabel}</span>
            <Button type="button" className="ml-auto h-11 min-w-28" disabled={saving} onClick={() => changeOpen(false)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Concluir'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
