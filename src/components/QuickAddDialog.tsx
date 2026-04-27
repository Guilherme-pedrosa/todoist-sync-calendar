import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  Flag,
  Tag,
  Bell,
  Inbox,
  Hash,
  ChevronDown,
  MapPin,
  MoreHorizontal,
  X,
  Paperclip,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useTaskStore } from '@/store/taskStore';
import { Priority } from '@/types/task';
import { parseNlp } from '@/lib/nlp';
import { DatePickerPopover, DateValue } from '@/components/DatePickerPopover';
import { RemindersDialog, ReminderItem } from '@/components/RemindersDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Prioridade 1',
  2: 'Prioridade 2',
  3: 'Prioridade 3',
  4: 'Prioridade 4',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  1: 'text-priority-1',
  2: 'text-priority-2',
  3: 'text-priority-3',
  4: 'text-muted-foreground/50',
};

function formatDateChip(date?: string, time?: string) {
  if (!date) return 'Sem data';
  const d = new Date(`${date}T00:00:00`);
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = format(today, 'yyyy-MM-dd');
  if (date === todayStr) return time ? `Hoje · ${time}` : 'Hoje';
  return time ? `${format(d, 'd MMM', { locale: ptBR })} · ${time}` : format(d, 'd MMM', { locale: ptBR });
}

export function QuickAddDialog() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const params = useParams();
  const { open, defaultProjectId, defaultParentId, defaultDueDate, closeQuickAdd } = useQuickAddStore();
  const projects = useTaskStore((s) => s.projects);
  const labels = useTaskStore((s) => s.labels);
  const addTask = useTaskStore((s) => s.addTask);

  const inboxProject = useMemo(() => projects.find((p) => p.isInbox), [projects]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<DateValue>({});
  const [priority, setPriority] = useState<Priority>(4);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [location_, setLocation_] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (title ? parseNlp(title) : null), [title]);
  const hasContent = title.trim() || description.trim();

  // Resolve route context
  const routeContext = useMemo(() => {
    const ctx: { projectId?: string | null; date?: string | null } = {};
    if (location.pathname.startsWith('/projects/') && params.projectId) {
      ctx.projectId = params.projectId;
    } else if (location.pathname.startsWith('/today')) {
      ctx.date = format(new Date(), 'yyyy-MM-dd');
    }
    return ctx;
  }, [location.pathname, params.projectId]);

  // initialize defaults whenever dialog opens
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setDate({ date: defaultDueDate ?? routeContext.date ?? undefined });
    setPriority(4);
    setSelectedLabels([]);
    setReminders([]);
    setLocation_('');
    setShowLocation(false);
    setProjectId(defaultProjectId || routeContext.projectId || inboxProject?.id);
    setTimeout(() => inputRef.current?.focus(), 60);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProjectId, defaultDueDate, inboxProject?.id]);

  // apply NLP suggestions
  useEffect(() => {
    if (!parsed) return;
    if (parsed.dueDate && !date.date) setDate((d) => ({ ...d, date: parsed.dueDate }));
    if (parsed.dueTime && !date.time) setDate((d) => ({ ...d, time: parsed.dueTime }));
    if (parsed.recurrenceRule && !date.recurrenceRule)
      setDate((d) => ({ ...d, recurrenceRule: parsed.recurrenceRule }));
    if (parsed.priority && priority === 4) setPriority(parsed.priority);
    if (parsed.labelTokens.length > 0) {
      const matched = labels
        .filter((l) => parsed.labelTokens.some((t) => t.toLowerCase() === l.name.toLowerCase()))
        .map((l) => l.id);
      if (matched.length > 0) {
        setSelectedLabels((prev) => Array.from(new Set([...prev, ...matched])));
      }
    }
    if (parsed.projectToken) {
      const proj = projects.find((p) => p.name.toLowerCase() === parsed.projectToken!.toLowerCase());
      if (proj) setProjectId(proj.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.cleanedTitle]);

  const submit = async (closeAfter = false) => {
    const finalTitle = (parsed?.cleanedTitle || title).trim();
    if (!finalTitle) return;
    // Use first relative reminder for the legacy single-reminder column
    const firstRelative = reminders.find((r) => r.type === 'relative');
    const created = await addTask({
      title: finalTitle,
      description: description.trim() || undefined,
      priority,
      dueDate: date.date,
      dueTime: date.time,
      recurrenceRule: date.recurrenceRule || null,
      projectId,
      parentId: defaultParentId || undefined,
      labels: selectedLabels,
      reminderMinutes: firstRelative?.relative_minutes ?? null,
    });
    // Insert any additional absolute reminders (besides the auto one)
    if (created && reminders.length > 0) {
      const additional = reminders.filter((r) => r.type === 'absolute');
      if (additional.length > 0) {
        const { supabase } = await import('@/integrations/supabase/client');
        await supabase.from('reminders').insert(
          additional.map((r) => ({
            task_id: created.id,
            type: 'absolute',
            channel: r.channel,
            trigger_at: r.trigger_at!,
            relative_minutes: null,
          }))
        );
      }
    }
    toast.success('Tarefa adicionada');
    // Reset for next entry (Todoist behavior)
    setTitle('');
    setDescription('');
    setDate({ date: defaultDueDate ?? routeContext.date ?? undefined });
    setPriority(4);
    setSelectedLabels([]);
    setReminders([]);
    setLocation_('');
    setShowLocation(false);
    setTimeout(() => inputRef.current?.focus(), 30);
    if (closeAfter) closeQuickAdd();
  };

  const requestClose = () => {
    if (hasContent) {
      setConfirmCloseOpen(true);
    } else {
      closeQuickAdd();
    }
  };

  const project = projects.find((p) => p.id === projectId);
  const dateChipLabel = formatDateChip(date.date, date.time);
  const dateChipFilled = !!date.date || !!date.recurrenceRule;

  const body = (
    <>
      {/* Confirm-close prompt */}
      {confirmCloseOpen && (
        <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur flex items-center justify-center p-6">
          <div className="text-center space-y-3 max-w-xs">
            <p className="text-sm font-medium">Descartar essa tarefa?</p>
            <p className="text-xs text-muted-foreground">
              As alterações serão perdidas
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="ghost" size="sm" onClick={() => setConfirmCloseOpen(false)}>
                Continuar editando
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setConfirmCloseOpen(false);
                  closeQuickAdd();
                }}
              >
                Descartar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 pb-2">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='Nome da tarefa'
          className="border-0 px-0 text-base font-semibold focus-visible:ring-0 h-9 placeholder:text-muted-foreground/60"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(false);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              requestClose();
            }
          }}
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição"
          className="border-0 px-0 text-sm text-muted-foreground focus-visible:ring-0 h-7"
        />
      </div>

      {/* NLP highlight pill */}
      {parsed && parsed.matchedRanges.some((r) => r.type === 'date' || r.type === 'recurrence') && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {parsed.dueDate && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">
              <CalendarIcon className="h-3 w-3" />
              {parsed.dueDate}{parsed.dueTime ? ` · ${parsed.dueTime}` : ''}
            </span>
          )}
          {parsed.recurrenceLabel && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
              ↻ {parsed.recurrenceLabel}
            </span>
          )}
        </div>
      )}

      {/* Toolbar (chips) */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5 border-b border-border">
        {/* Date chip with explicit X */}
        <div className="inline-flex">
          <DatePickerPopover
            value={date}
            onChange={setDate}
            trigger={
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors',
                  dateChipFilled
                    ? 'border-success/40 text-success bg-success/5'
                    : 'border-border text-muted-foreground hover:border-success/40'
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateChipLabel}
                {dateChipFilled && (
                  <X
                    className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDate({});
                    }}
                  />
                )}
              </button>
            }
          />
        </div>

        {/* Deadline (TODO Fase 4) */}
        <button
          type="button"
          disabled
          title="Prazo (em breve)"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-dashed border-border text-muted-foreground/60 cursor-not-allowed"
        >
          🎯 Prazo
        </button>

        {/* Attachment (TODO Fase 4) */}
        <button
          type="button"
          disabled
          title="Anexo (em breve)"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-dashed border-border text-muted-foreground/60 cursor-not-allowed"
        >
          <Paperclip className="h-3.5 w-3.5" /> Anexo
          <span className="text-[9px] uppercase font-bold ml-1 px-1 rounded bg-primary/10 text-primary">novo</span>
        </button>

        {/* Priority */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors',
                priority < 4
                  ? 'border-primary/30 text-primary bg-primary/5'
                  : 'border-border text-muted-foreground hover:border-primary/30'
              )}
            >
              <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLOR[priority])} /> {PRIORITY_LABELS[priority]}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="start">
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn(
                  'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                  priority === p ? 'bg-muted' : 'hover:bg-muted'
                )}
              >
                <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLOR[p])} />
                {PRIORITY_LABELS[p]}
                <span className="ml-auto text-[10px] text-muted-foreground">!{p}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Reminder */}
        <button
          type="button"
          disabled={!date.date}
          onClick={() => setRemindersOpen(true)}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors',
            reminders.length > 0
              ? 'border-warning/40 text-warning bg-warning/5'
              : 'border-border text-muted-foreground hover:border-warning/40 disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title={!date.date ? 'Defina uma data primeiro' : 'Lembretes'}
        >
          <Bell className="h-3.5 w-3.5" />
          {reminders.length > 0 ? `${reminders.length} lembrete(s)` : 'Lembretes'}
        </button>

        {/* More */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center text-xs px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:border-primary/30 transition-colors"
              aria-label="Mais ações"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            {/* Labels submenu */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-muted text-left"
                >
                  <Tag className="h-3.5 w-3.5" />
                  Etiquetas {selectedLabels.length > 0 && `(${selectedLabels.length})`}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1 max-h-72 overflow-y-auto" side="right" align="start">
                {labels.length === 0 && (
                  <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                    Nenhuma etiqueta. Crie na barra lateral.
                  </div>
                )}
                {labels.map((l) => {
                  const checked = selectedLabels.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() =>
                        setSelectedLabels((prev) =>
                          checked ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                        )
                      }
                      className={cn(
                        'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                        checked ? 'bg-accent/10 text-accent' : 'hover:bg-muted'
                      )}
                    >
                      <Tag className="h-3 w-3" style={{ color: l.color }} />
                      {l.name}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
            <button
              onClick={() => setShowLocation((v) => !v)}
              className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-muted text-left"
            >
              <MapPin className="h-3.5 w-3.5" />
              Local {location_ && '✓'}
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Optional location field */}
      {showLocation && (
        <div className="px-4 py-2 border-b border-border">
          <Input
            value={location_}
            onChange={(e) => setLocation_(e.target.value)}
            placeholder="Local (opcional, salvo na descrição)"
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              {project?.isInbox ? (
                <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Hash className="h-3.5 w-3.5" style={{ color: project?.color }} />
              )}
              <span>{project?.name || 'Caixa de Entrada'}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1 max-h-72 overflow-y-auto" align="start">
            {projects
              .slice()
              .sort((a, b) => (a.isInbox ? -1 : b.isInbox ? 1 : (a.position ?? 0) - (b.position ?? 0)))
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProjectId(p.id)}
                  className={cn(
                    'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                    projectId === p.id ? 'bg-muted' : 'hover:bg-muted'
                  )}
                >
                  {p.isInbox ? (
                    <Inbox className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Hash className="h-3 w-3" style={{ color: p.color }} />
                  )}
                  {p.name}
                </button>
              ))}
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={requestClose} className="h-8 text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => submit(false)}
            disabled={!(parsed?.cleanedTitle || title).trim()}
            className="h-8 text-xs"
          >
            Adicionar tarefa
          </Button>
        </div>
      </div>

      <RemindersDialog
        open={remindersOpen}
        onOpenChange={setRemindersOpen}
        initial={reminders}
        onSave={setReminders}
      />
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
        <DrawerContent className="max-h-[90vh] p-0">
          <div className="relative pb-2">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <div className="relative">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
