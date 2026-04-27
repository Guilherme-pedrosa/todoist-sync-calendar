import { useEffect, useMemo, useState } from 'react';
import { Plus, Flag, Tag, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { Priority } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { parseNlp } from '@/lib/nlp';
import { DatePickerPopover, DateValue } from '@/components/DatePickerPopover';

interface AddTaskFormProps {
  defaultProjectId?: string;
  defaultDate?: string;
  defaultParentId?: string;
}

export function AddTaskForm({ defaultProjectId, defaultDate, defaultParentId }: AddTaskFormProps) {
  const projects = useTaskStore((s) => s.projects);
  const allLabels = useTaskStore((s) => s.labels);
  const addTask = useTaskStore((s) => s.addTask);

  const inboxProject = useMemo(() => projects.find((p) => p.isInbox), [projects]);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(4);
  const [date, setDate] = useState<DateValue>({ date: defaultDate });
  const [projectId, setProjectId] = useState(defaultProjectId || inboxProject?.id || '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [nlpSet, setNlpSet] = useState({ date: false, time: false, rec: false, prio: false });

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
    if (defaultDate) setDate((d) => ({ ...d, date: defaultDate }));
  }, [defaultProjectId, defaultDate]);

  const parsed = useMemo(() => (title ? parseNlp(title) : null), [title]);

  // Auto-apply NLP suggestions — NLP é autoritativa enquanto o token existir.
  useEffect(() => {
    if (!parsed) return;
    setDate((d) => ({
      ...d,
      date: parsed.dueDate || (nlpSet.date ? undefined : d.date),
      time: parsed.dueTime || (nlpSet.time ? undefined : d.time),
      recurrenceRule: parsed.recurrenceRule || (nlpSet.rec ? null : d.recurrenceRule),
    }));
    if (parsed.priority) setPriority(parsed.priority);
    else if (nlpSet.prio) setPriority(4);
    setNlpSet({
      date: !!parsed.dueDate,
      time: !!parsed.dueTime,
      rec: !!parsed.recurrenceRule,
      prio: !!parsed.priority,
    });
    if (parsed.labelTokens.length > 0) {
      const matched = allLabels
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
  }, [title]);

  const handleSubmit = async () => {
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
      parentId: defaultParentId,
      labels: selectedLabels,
    });

    setTitle('');
    setDescription('');
    setPriority(4);
    setDate({ date: defaultDate });
    setSelectedLabels([]);
    setIsOpen(false);
  };

  const toggleLabel = (id: string) => {
    setSelectedLabels((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  };

  if (!isOpen) {
    return (
      <button
        data-add-task-form
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-3 text-sm text-muted-foreground hover:text-primary transition-colors group"
      >
        <span className="h-[18px] w-[18px] rounded-full border-2 border-dashed border-muted-foreground/30 group-hover:border-primary group-hover:bg-primary/10 flex items-center justify-center transition-colors">
          <Plus className="h-3 w-3" />
        </span>
        Adicionar tarefa
      </button>
    );
  }

  return (
    <div className="mx-1 rounded-xl border border-border bg-card p-3 shadow-sm animate-slide-in">
      <Input
        autoFocus
        placeholder='Nome da tarefa  (ex.: "Reunião amanhã 14h p1 toda semana")'
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) handleSubmit();
          if (e.key === 'Escape') setIsOpen(false);
        }}
        className="border-0 px-0 text-sm font-medium focus-visible:ring-0 h-8 bg-transparent"
      />
      <Input
        placeholder="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="border-0 px-0 text-xs text-muted-foreground focus-visible:ring-0 h-7 bg-transparent"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <DatePickerPopover value={date} onChange={setDate} />

        {/* Priority */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
                priority < 4 ? 'border-primary/30 text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/30'
              )}
            >
              <Flag className="h-3 w-3" />
              P{priority}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex gap-1">
              {([1, 2, 3, 4] as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex items-center gap-1 text-xs px-2 py-1.5 rounded-md transition-colors',
                    priority === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  <Flag className={cn('h-3 w-3', `text-priority-${p}`)} />
                  P{p}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Project */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:border-primary/30 transition-colors">
              <Folder className="h-3 w-3" />
              {projects.find((p) => p.id === projectId)?.name || 'Projeto'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 max-h-72 overflow-y-auto" align="start">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectId(p.id)}
                className={cn(
                  'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                  projectId === p.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Labels */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
              selectedLabels.length > 0 ? 'border-accent/40 text-accent bg-accent/5' : 'border-border text-muted-foreground hover:border-accent/40'
            )}>
              <Tag className="h-3 w-3" />
              {selectedLabels.length > 0 ? `${selectedLabels.length} etiqueta(s)` : 'Etiquetas'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 max-h-72 overflow-y-auto" align="start">
            {allLabels.map((l) => (
              <button
                key={l.id}
                onClick={() => toggleLabel(l.id)}
                className={cn(
                  'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                  selectedLabels.includes(l.id) ? 'bg-accent/10 text-accent' : 'hover:bg-muted'
                )}
              >
                <Tag className="h-3 w-3" style={{ color: selectedLabels.includes(l.id) ? undefined : l.color }} />
                {l.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-7 text-xs">
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!(parsed?.cleanedTitle || title).trim()}
          className="h-7 text-xs"
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}
