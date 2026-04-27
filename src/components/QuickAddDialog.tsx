import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Flag,
  Folder,
  Tag,
  Bell,
  Inbox,
  Hash,
  ChevronDown,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Prioridade 1',
  2: 'Prioridade 2',
  3: 'Prioridade 3',
  4: 'Prioridade 4',
};

export function QuickAddDialog() {
  const { open, defaultProjectId, defaultParentId, closeQuickAdd } = useQuickAddStore();
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
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (title ? parseNlp(title) : null), [title]);

  // initialize defaults whenever dialog opens
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setDate({});
    setPriority(4);
    setSelectedLabels([]);
    setReminderMinutes(null);
    setProjectId(defaultProjectId || inboxProject?.id);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, [open, defaultProjectId, inboxProject?.id]);

  // apply NLP suggestions automatically (debounced via memo)
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

  const submit = async () => {
    const finalTitle = (parsed?.cleanedTitle || title).trim();
    if (!finalTitle) return;
    await addTask({
      title: finalTitle,
      description: description.trim() || undefined,
      priority,
      dueDate: date.date,
      dueTime: date.time,
      recurrenceRule: date.recurrenceRule || null,
      projectId,
      parentId: defaultParentId || undefined,
      labels: selectedLabels,
      reminderMinutes,
    });
    closeQuickAdd();
  };

  const project = projects.find((p) => p.id === projectId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeQuickAdd()}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='Ex.: "Reunião amanhã 14h #Trabalho @reuniao p1 toda semana"'
            className="border-0 px-0 text-base font-semibold focus-visible:ring-0 h-9 placeholder:text-muted-foreground/60"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') closeQuickAdd();
            }}
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição"
            className="border-0 px-0 text-sm text-muted-foreground focus-visible:ring-0 h-7"
          />
        </div>

        {/* NLP preview chips */}
        {parsed && parsed.matchedRanges.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {parsed.dueDate && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                <CalendarIcon className="h-3 w-3" />
                {parsed.dueDate}
                {parsed.dueTime ? ` · ${parsed.dueTime}` : ''}
              </span>
            )}
            {parsed.recurrenceLabel && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                ↻ {parsed.recurrenceLabel}
              </span>
            )}
            {parsed.priority && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-priority-2/10 text-priority-2">
                <Flag className="h-3 w-3" /> P{parsed.priority}
              </span>
            )}
          </div>
        )}

        {/* Toolbar (chips) */}
        <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5 border-b border-border">
          <DatePickerPopover value={date} onChange={setDate} />

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
                <Flag className="h-3.5 w-3.5" /> {PRIORITY_LABELS[priority]}
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
                  <Flag className={cn('h-3.5 w-3.5', `text-priority-${p}`)} />
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Labels */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors',
                  selectedLabels.length > 0
                    ? 'border-accent/40 text-accent bg-accent/5'
                    : 'border-border text-muted-foreground hover:border-accent/40'
                )}
              >
                <Tag className="h-3.5 w-3.5" />
                {selectedLabels.length > 0 ? `${selectedLabels.length} etiqueta(s)` : 'Etiquetas'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1 max-h-72 overflow-y-auto" align="start">
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

          {/* Reminder */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!date.date || !date.time}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors',
                  reminderMinutes != null
                    ? 'border-warning/40 text-warning bg-warning/5'
                    : 'border-border text-muted-foreground hover:border-warning/40 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                title={!date.time ? 'Defina uma hora primeiro' : 'Lembretes'}
              >
                <Bell className="h-3.5 w-3.5" />
                {reminderMinutes != null ? `${reminderMinutes} min antes` : 'Lembrete'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="start">
              {[0, 5, 10, 15, 30, 60, 1440].map((m) => (
                <button
                  key={m}
                  onClick={() => setReminderMinutes(m)}
                  className={cn(
                    'w-full text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                    reminderMinutes === m ? 'bg-muted' : 'hover:bg-muted'
                  )}
                >
                  {m === 0 ? 'No horário' : m === 1440 ? '1 dia antes' : m >= 60 ? `${m / 60}h antes` : `${m} min antes`}
                </button>
              ))}
              {reminderMinutes != null && (
                <button
                  onClick={() => setReminderMinutes(null)}
                  className="w-full text-xs px-2 py-1.5 rounded-md hover:bg-destructive/10 text-destructive text-left"
                >
                  Remover lembrete
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Footer: project selector + actions */}
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
            <Button variant="ghost" size="sm" onClick={closeQuickAdd} className="h-8 text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!(parsed?.cleanedTitle || title).trim()}
              className="h-8 text-xs"
            >
              Adicionar tarefa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
