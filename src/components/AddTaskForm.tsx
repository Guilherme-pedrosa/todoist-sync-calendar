import { useState } from 'react';
import {
  Plus,
  Calendar,
  Flag,
  Tag,
  Folder,
  X,
  Clock,
  Repeat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { Priority, RecurrenceType } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AddTaskFormProps {
  defaultProjectId?: string;
}

export function AddTaskForm({ defaultProjectId }: AddTaskFormProps) {
  const { addTask, projects, labels: allLabels, activeView, activeProjectId } = useTaskStore();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(4);
  const [dueDate, setDueDate] = useState<Date | undefined>(
    activeView === 'today' ? new Date() : undefined
  );
  const [dueTime, setDueTime] = useState('');
  const inboxProject = projects.find(p => p.isInbox);
  const [projectId, setProjectId] = useState(defaultProjectId || activeProjectId || inboxProject?.id || '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<RecurrenceType | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) return;

    addTask({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
      dueTime: dueTime || undefined,
      projectId,
      labels: selectedLabels,
      parentId: undefined,
      recurrence: recurrence ? { type: recurrence, interval: 1 } : undefined,
    });

    setTitle('');
    setDescription('');
    setPriority(4);
    setDueDate(activeView === 'today' ? new Date() : undefined);
    setDueTime('');
    setSelectedLabels([]);
    setRecurrence(null);
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
        placeholder="Nome da tarefa"
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
        {/* Date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
                dueDate ? 'border-primary/30 text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/30'
              )}
            >
              <Calendar className="h-3 w-3" />
              {dueDate ? format(dueDate, "d MMM", { locale: ptBR }) : 'Data'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              mode="single"
              selected={dueDate}
              onSelect={setDueDate}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>

        {/* Time */}
        <div className="relative">
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className={cn(
              'text-xs px-2 py-1 rounded-md border bg-transparent transition-colors w-[90px]',
              dueTime ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground'
            )}
          />
        </div>

        {/* Priority */}
        <Popover>
          <PopoverTrigger asChild>
            <button
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
            <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:border-primary/30 transition-colors">
              <Folder className="h-3 w-3" />
              {projects.find((p) => p.id === projectId)?.name || 'Projeto'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
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
            <button className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
              selectedLabels.length > 0 ? 'border-primary/30 text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/30'
            )}>
              <Tag className="h-3 w-3" />
              {selectedLabels.length > 0 ? `${selectedLabels.length} etiqueta(s)` : 'Etiquetas'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            {allLabels.map((l) => (
              <button
                key={l.id}
                onClick={() => toggleLabel(l.id)}
                className={cn(
                  'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                  selectedLabels.includes(l.id) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Tag className="h-3 w-3" style={{ color: selectedLabels.includes(l.id) ? undefined : l.color }} />
                {l.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Recurrence */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
              recurrence ? 'border-primary/30 text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/30'
            )}>
              <Repeat className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-2" align="start">
            {(['daily', 'weekly', 'monthly', 'yearly'] as RecurrenceType[]).map((r) => (
              <button
                key={r}
                onClick={() => setRecurrence(recurrence === r ? null : r)}
                className={cn(
                  'w-full text-xs px-2 py-1.5 rounded-md transition-colors text-left capitalize',
                  recurrence === r ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                {{ daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' }[r]}
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
          disabled={!title.trim()}
          className="h-7 text-xs"
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}
