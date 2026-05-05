import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  MoreHorizontal,
  Hash,
  Inbox,
  Calendar as CalendarIcon,
  Flag,
  Tag,
  Bell,
  MapPin,
  Trash2,
  Copy,
  Printer,
  Link as LinkIcon,
  FolderInput,
  Plus,
  Send,
  Paperclip,
  MessageSquare,
  Users,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCompleteTask } from '@/hooks/useCompleteTask';
import { useUpdateTaskWithRecurrencePrompt } from '@/hooks/useUpdateTaskWithRecurrencePrompt';
import { useDeleteTaskWithRecurrencePrompt } from '@/hooks/useDeleteTaskWithRecurrencePrompt';
import { Task, Priority } from '@/types/task';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DatePickerPopover, DateValue } from '@/components/DatePickerPopover';
import { RemindersDialog } from '@/components/RemindersDialog';
import { TaskConversationButton } from '@/components/TaskConversationButton';
import { TaskActivityLog } from '@/components/TaskActivityLog';
import { ScheduleMeetingDialog } from '@/components/ScheduleMeetingDialog';
import { AssigneeChip } from '@/components/AssigneeChip';
import { supabase } from '@/integrations/supabase/client';
import { parseNlp } from '@/lib/nlp';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'P1 — Urgente',
  2: 'P2 — Alta',
  3: 'P3 — Média',
  4: 'P4 — Baixa',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  1: 'text-priority-1',
  2: 'text-priority-2',
  3: 'text-priority-3',
  4: 'text-muted-foreground',
};

interface CommentRow {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

// Converte uma RRULE simples em texto pt-BR legível
function formatRecurrence(rule?: string | null): string | null {
  if (!rule) return null;
  const r = rule.toUpperCase();
  const freqMatch = r.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);
  if (!freqMatch) return null;
  const freq = freqMatch[1] as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  const intervalMatch = r.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;
  const bydayMatch = r.match(/BYDAY=([A-Z,]+)/);
  const bymonthdayMatch = r.match(/BYMONTHDAY=(\d+)/);

  const DAYS_PT: Record<string, string> = {
    MO: 'seg', TU: 'ter', WE: 'qua', TH: 'qui', FR: 'sex', SA: 'sáb', SU: 'dom',
  };

  if (freq === 'WEEKLY' && bydayMatch) {
    if (bydayMatch[1] === 'MO,TU,WE,TH,FR') return 'Todo dia útil';
    const days = bydayMatch[1].split(',').map((d) => DAYS_PT[d] || d).join(', ');
    return `Toda semana (${days})`;
  }
  if (freq === 'MONTHLY' && bymonthdayMatch) {
    return interval > 1
      ? `A cada ${interval} meses no dia ${bymonthdayMatch[1]}`
      : `Todo dia ${bymonthdayMatch[1]} do mês`;
  }
  if (interval === 1) {
    return { DAILY: 'Todo dia', WEEKLY: 'Toda semana', MONTHLY: 'Todo mês', YEARLY: 'Todo ano' }[freq];
  }
  const unitPlural = { DAILY: 'dias', WEEKLY: 'semanas', MONTHLY: 'meses', YEARLY: 'anos' }[freq];
  return `A cada ${interval} ${unitPlural}`;
}

export function TaskDetailPanel() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const taskId = useTaskDetailStore((s) => s.taskId);
  const occurrenceDate = useTaskDetailStore((s) => s.occurrenceDate);
  const rangeStart = useTaskDetailStore((s) => s.rangeStart);
  const rangeEnd = useTaskDetailStore((s) => s.rangeEnd);
  const close = useTaskDetailStore((s) => s.close);
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useTaskStore((s) => s.projects);
  const allLabels = useTaskStore((s) => s.labels);
  const updateTask = useTaskStore((s) => s.updateTask);
  const updateWithPrompt = useUpdateTaskWithRecurrencePrompt();
  const deleteWithPrompt = useDeleteTaskWithRecurrencePrompt();
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const complete = useCompleteTask();

  const task = useMemo(() => tasks.find((t) => t.id === taskId) || null, [tasks, taskId]);
  const subtasks = useMemo(
    () => (task ? tasks.filter((t) => t.parentId === task.id) : []),
    [tasks, task]
  );

  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Sync drafts when task changes
  useEffect(() => {
    if (!task) return;
    setTitleDraft(task.title);
    setDescDraft(task.description ?? '');
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [titleDraft, task?.id]);

  // Load comments + realtime subscription
  useEffect(() => {
    if (!task?.id) {
      setComments([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('comments')
        .select('id,user_id,content,created_at')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });
      if (active && data) setComments(data as CommentRow[]);
    })();

    const channel = supabase
      .channel(`comments-${task.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `task_id=eq.${task.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setComments((prev) =>
              prev.find((c) => c.id === (payload.new as any).id)
                ? prev
                : [...prev, payload.new as CommentRow]
            );
          } else if (payload.eventType === 'DELETE') {
            setComments((prev) => prev.filter((c) => c.id !== (payload.old as any).id));
          } else if (payload.eventType === 'UPDATE') {
            setComments((prev) =>
              prev.map((c) => (c.id === (payload.new as any).id ? (payload.new as CommentRow) : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [task?.id]);

  // Load task assignees + realtime
  useEffect(() => {
    if (!task?.id) {
      setAssigneeIds([]);
      return;
    }
    let active = true;
    const refresh = async () => {
      const { data } = await supabase
        .from('task_assignees')
        .select('user_id')
        .eq('task_id', task.id);
      if (active && data) setAssigneeIds(data.map((r: any) => r.user_id));
    };
    void refresh();

    const ch = supabase
      .channel(`task-assignees-${task.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_assignees', filter: `task_id=eq.${task.id}` },
        () => { void refresh(); }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [task?.id]);

  const handleAssigneesChange = async (next: string[]) => {
    if (!task) return;
    const prev = assigneeIds;
    setAssigneeIds(next);
    // Sync into store so views (calendar) react immediately
    useTaskStore.setState((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, assigneeIds: next } : t)),
    }));
    const toAdd = next.filter((id) => !prev.includes(id));
    const toRemove = prev.filter((id) => !next.includes(id));
    try {
      if (toRemove.length > 0) {
        await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', task.id)
          .in('user_id', toRemove);
      }
      if (toAdd.length > 0) {
        await supabase.from('task_assignees').insert(
          toAdd.map((uid) => ({
            task_id: task.id,
            user_id: uid,
            assigned_by: user?.id,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to update assignees', err);
      toast.error('Falha ao atualizar responsáveis');
      setAssigneeIds(prev);
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, assigneeIds: prev } : t)),
      }));
    }
  };

  // Keyboard shortcuts within panel
  useEffect(() => {
    if (!task) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          complete(task.id);
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'j':
        case 'k': {
          // navigate within visible tasks (top-level, by created order)
          const list = tasks.filter((t) => !t.completed && !t.parentId);
          const idx = list.findIndex((t) => t.id === task.id);
          if (idx === -1) break;
          const dir = e.key.toLowerCase() === 'j' ? 1 : -1;
          const next = list[idx + dir];
          if (next) {
            e.preventDefault();
            useTaskDetailStore.getState().open(next.id);
          }
          break;
        }
        case 'e':
          e.preventDefault();
          titleRef.current?.focus();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [task, tasks, close, complete]);

  if (!task) return null;

  const project = projects.find((p) => p.id === task.projectId);
  const taskLabels = allLabels.filter((l) => task.labels.includes(l.id));
  const selectedOccurrenceDate = occurrenceDate ?? task.dueDate;
  const dateValue: DateValue = {
    date: selectedOccurrenceDate,
    time: task.dueTime,
    durationMinutes: task.durationMinutes ?? null,
    recurrenceRule: task.recurrenceRule,
  };

  const persistTitle = () => {
    const rawTitle = titleDraft.trim();
    if (!rawTitle) return;
    const parsed = parseNlp(rawTitle);
    const nextTitle = parsed.cleanedTitle.trim() || rawTitle;
    const updates: Partial<Task> = {};
    if (nextTitle !== task.title) updates.title = nextTitle;
    if (parsed.dueDate) updates.dueDate = parsed.dueDate;
    if (parsed.dueTime) updates.dueTime = parsed.dueTime;
    if (parsed.durationMinutes !== undefined) updates.durationMinutes = parsed.durationMinutes;
    if (parsed.recurrenceRule) updates.recurrenceRule = parsed.recurrenceRule;
    if (parsed.priority) updates.priority = parsed.priority;
    if (Object.keys(updates).length > 0) {
      updateTask(task.id, updates);
      setTitleDraft(nextTitle);
    }
  };
  const persistDesc = () => {
    if (descDraft !== (task.description ?? '')) {
      updateTask(task.id, { description: descDraft });
    }
  };

  const sendComment = async () => {
    if (!commentText.trim() || !user) return;
    const text = commentText.trim();
    setCommentText('');
    const { error } = await supabase.from('comments').insert({
      task_id: task.id,
      user_id: user.id,
      content: text,
    });
    if (error) toast.error('Falha ao comentar');
  };

  const updateCommentSave = async () => {
    if (!editingComment) return;
    await supabase
      .from('comments')
      .update({ content: editingComment.text })
      .eq('id', editingComment.id);
    setEditingComment(null);
  };

  const deleteComment = async (id: string) => {
    await supabase.from('comments').delete().eq('id', id);
  };

  const navigateTask = (dir: 1 | -1) => {
    const list = tasks.filter((t) => !t.completed && !t.parentId);
    const idx = list.findIndex((t) => t.id === task.id);
    if (idx === -1) return;
    const next = list[idx + dir];
    if (next) useTaskDetailStore.getState().open(next.id);
  };

  const summaryLine = (() => {
    const parts: string[] = [];
    if (task.dueDate) parts.push(format(parseISO(task.dueDate), "d 'de' MMM", { locale: ptBR }));
    if (task.dueTime) parts.push(task.dueTime);
    const rec = formatRecurrence(task.recurrenceRule);
    if (rec) parts.push(`🔁 ${rec}`);
    return parts.join(' · ');
  })();

  const content = (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border pt-[max(0.5rem,env(safe-area-inset-top))]">
        {isMobile && (
          <button
            onClick={close}
            className="-ml-1 mr-1 h-9 w-9 flex items-center justify-center rounded-md hover:bg-muted active:bg-muted text-foreground"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={() => task.projectId && navigate(`/projects/${task.projectId}`)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0 truncate"
        >
          {project?.isInbox ? (
            <Inbox className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Hash className="h-3.5 w-3.5 shrink-0" style={{ color: project?.color }} />
          )}
          <span className="truncate">{project?.name || 'Projeto'}</span>
        </button>
        <div className="ml-auto flex items-center">
          <button
            onClick={() => navigateTask(-1)}
            className="p-1.5 hover:bg-muted rounded text-muted-foreground"
            aria-label="Anterior (K)"
            title="Anterior (K)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => navigateTask(1)}
            className="p-1.5 hover:bg-muted rounded text-muted-foreground"
            aria-label="Próxima (J)"
            title="Próxima (J)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 hover:bg-muted rounded text-muted-foreground" aria-label="Mais">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard.writeText(window.location.href + `#task=${task.id}`);
                  toast.success('Link copiado');
                }}
              >
                <LinkIcon className="h-4 w-4 mr-2" /> Copiar link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openQuickAdd({
                    defaultProjectId: task.projectId ?? null,
                    defaultParentId: task.parentId ?? null,
                  })
                }
              >
                <Copy className="h-4 w-4 mr-2" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMeetingOpen(true)}>
                <Video className="h-4 w-4 mr-2" /> Transformar em reunião
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={async () => {
                  const result = await deleteWithPrompt(task.id, {
                    occurrenceDate: selectedOccurrenceDate ?? undefined,
                    rangeStart: rangeStart ?? undefined,
                    rangeEnd: rangeEnd ?? undefined,
                  });
                  if (result !== 'cancelled') close();
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={close}
            className="p-2 hover:bg-muted active:bg-muted rounded text-foreground ml-1 h-9 w-9 flex items-center justify-center"
            aria-label="Fechar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className={cn('flex flex-col lg:flex-row', !isMobile && 'lg:flex-row')}>
          {/* Main */}
          <div className="flex-1 px-5 py-4 space-y-4 min-w-0">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex items-center gap-1 shrink-0">
                <button
                  onClick={() => complete(task.id)}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 flex items-center justify-center',
                    task.completed
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30 hover:border-primary'
                  )}
                  aria-label="Concluir"
                >
                  {task.completed && (
                    <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                {task.recurrenceRule && !task.completed && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
                        aria-label="Opções de conclusão"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem onClick={() => complete(task.id)}>
                        Concluir esta ocorrência
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => complete(task.id, { endRecurring: true })}
                        className="text-destructive focus:text-destructive"
                      >
                        Finalizar para sempre
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {task.taskNumber != null && (
                <div className="text-xs font-mono text-muted-foreground/70 tabular-nums mb-1">
                  #{task.taskNumber}
                </div>
              )}
              <Textarea
                ref={titleRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={persistTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    persistTitle();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                className={cn(
                  'min-h-0 resize-none overflow-hidden border-0 px-0 py-0 text-lg font-semibold leading-snug focus-visible:ring-0 break-words whitespace-pre-wrap',
                  task.completed && 'line-through text-muted-foreground'
                )}
              />
            </div>

            <div className="pl-8 space-y-3">
              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={persistDesc}
                placeholder="≡ Descrição"
                className="border-0 px-0 text-sm resize-none focus-visible:ring-0 min-h-[60px]"
              />

              <button
                onClick={() =>
                  openQuickAdd({
                    defaultParentId: task.id,
                    defaultProjectId: task.projectId ?? null,
                  })
                }
                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Adicionar subtarefa
              </button>

              {/* Subtasks list */}
              {subtasks.length > 0 && (
                <div className="space-y-1 mt-2">
                  {subtasks.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => useTaskDetailStore.getState().open(sub.id)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          complete(sub.id);
                        }}
                        className={cn(
                          'h-4 w-4 mt-0.5 rounded-full border-2 shrink-0',
                          sub.completed ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                        )}
                      />
                      <span
                        className={cn(
                          'text-sm flex-1 break-words whitespace-normal',
                          sub.completed && 'line-through text-muted-foreground'
                        )}
                      >
                        {sub.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Task conversation launcher */}
            {task.id && <TaskConversationButton taskId={task.id} />}

            {/* Activity log */}
            {task.id && <TaskActivityLog taskId={task.id} />}

            {/* Comments */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <MessageSquare className="h-3.5 w-3.5" /> Comentários
              </div>
              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground/70">Sem comentários ainda</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <div className="h-7 w-7 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center">
                      {c.user_id === user?.id ? (user?.email?.[0] ?? '?').toUpperCase() : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium">
                          {c.user_id === user?.id ? 'Você' : 'Usuário'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(parseISO(c.created_at), { locale: ptBR, addSuffix: true })}
                        </span>
                      </div>
                      {editingComment?.id === c.id ? (
                        <div className="mt-1 space-y-1">
                          <Textarea
                            value={editingComment.text}
                            onChange={(e) => setEditingComment({ ...editingComment, text: e.target.value })}
                            className="text-sm"
                            rows={2}
                          />
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditingComment(null)} className="h-6 text-xs">
                              Cancelar
                            </Button>
                            <Button size="sm" onClick={updateCommentSave} className="h-6 text-xs">
                              Salvar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                      )}
                      {c.user_id === user?.id && editingComment?.id !== c.id && (
                        <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                          <button
                            onClick={() => setEditingComment({ id: c.id, text: c.content })}
                            className="hover:text-foreground"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="hover:text-destructive"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Composer */}
              <div className="flex gap-2 pt-2">
                <div className="h-7 w-7 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center">
                  {(user?.email?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void sendComment();
                      }
                    }}
                    placeholder="Escreva um comentário... (Ctrl+Enter para enviar)"
                    className="text-sm min-h-[60px]"
                    rows={2}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => void sendComment()}
                      disabled={!commentText.trim()}
                      className="h-7 text-xs"
                    >
                      Comentar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-[260px] lg:border-l border-border bg-muted/20 px-4 py-4 space-y-4 lg:shrink-0">
            <DetailRow icon={CalendarIcon} label="Data">
              <DatePickerPopover
                commitOnClose
                value={dateValue}
                onChange={(v) =>
                  updateWithPrompt(
                    task.id,
                    {
                      dueDate: v.date ?? null as any,
                      dueTime: v.time ?? null as any,
                      recurrenceRule: v.recurrenceRule ?? null,
                      durationMinutes: v.durationMinutes ?? null,
                    },
                    { occurrenceDate: selectedOccurrenceDate ?? undefined, changeLabel: 'data e horário' }
                  )
                }
                trigger={
                  <button className="w-full text-left text-sm hover:text-primary">
                    {summaryLine || <span className="text-muted-foreground">Adicionar data</span>}
                  </button>
                }
              />
            </DetailRow>

            <DetailRow icon={FolderInput} label="Projeto">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="w-full text-left text-sm hover:text-primary flex items-center gap-2">
                    {project?.isInbox ? (
                      <Inbox className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Hash className="h-3.5 w-3.5 shrink-0" style={{ color: project?.color }} />
                    )}
                    <span className="truncate">
                      {project?.name ?? <span className="text-muted-foreground">Selecionar projeto</span>}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-1 max-h-72 overflow-y-auto" align="end">
                  {projects
                    .slice()
                    .sort((a, b) => {
                      if (a.isInbox) return -1;
                      if (b.isInbox) return 1;
                      return a.name.localeCompare(b.name);
                    })
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => updateTask(task.id, { projectId: p.id })}
                        className={cn(
                          'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-muted text-left',
                          p.id === task.projectId && 'bg-muted font-medium'
                        )}
                      >
                        {p.isInbox ? (
                          <Inbox className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Hash className="h-3.5 w-3.5 shrink-0" style={{ color: p.color }} />
                        )}
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                </PopoverContent>
              </Popover>
            </DetailRow>

            <DetailRow icon={Users} label="Responsável">
              <AssigneeChip
                projectId={task.projectId ?? null}
                value={assigneeIds}
                onChange={handleAssigneesChange}
              />
            </DetailRow>

            <DetailRow icon={Flag} label="Prioridade">
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn('w-full text-left text-sm hover:text-primary flex items-center gap-2', PRIORITY_COLOR[task.priority])}>
                    <Flag className="h-3.5 w-3.5" />
                    {PRIORITY_LABELS[task.priority]}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="end">
                  {([1, 2, 3, 4] as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => updateTask(task.id, { priority: p })}
                      className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-muted text-left"
                    >
                      <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLOR[p])} />
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </DetailRow>

            <DetailRow icon={Tag} label="Etiquetas">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="w-full text-left text-sm hover:text-primary">
                    {taskLabels.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {taskLabels.map((l) => (
                          <span
                            key={l.id}
                            className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${l.color}20`, color: l.color }}
                          >
                            {l.name}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Adicionar etiquetas</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1 max-h-72 overflow-y-auto" align="end">
                  {allLabels.length === 0 && (
                    <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                      Nenhuma etiqueta
                    </div>
                  )}
                  {allLabels.map((l) => {
                    const checked = task.labels.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={async () => {
                          if (checked) {
                            await supabase
                              .from('task_labels')
                              .delete()
                              .eq('task_id', task.id)
                              .eq('label_id', l.id);
                            updateTask(task.id, { labels: task.labels.filter((x) => x !== l.id) } as any);
                          } else {
                            await supabase
                              .from('task_labels')
                              .insert({ task_id: task.id, label_id: l.id });
                            updateTask(task.id, { labels: [...task.labels, l.id] } as any);
                          }
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md text-left',
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
            </DetailRow>

            <DetailRow icon={Bell} label="Lembretes">
              <button
                disabled={!task.dueDate}
                onClick={() => setRemindersOpen(true)}
                className={cn(
                  'w-full text-left text-sm hover:text-primary',
                  !task.dueDate && 'text-muted-foreground/50 cursor-not-allowed'
                )}
              >
                {task.dueDate ? 'Gerenciar lembretes' : 'Defina uma data primeiro'}
              </button>
            </DetailRow>
          </aside>
        </div>
      </div>

      {/* Footer: comment input + summary */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        <div className="text-[11px] text-muted-foreground flex items-center gap-3">
          {subtasks.length > 0 && (
            <span>
              {subtasks.filter((s) => s.completed).length}/{subtasks.length} subtarefas
            </span>
          )}
          {summaryLine && <span>{summaryLine}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center">
            {(user?.email?.[0] ?? '?').toUpperCase()}
          </div>
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendComment();
              }
            }}
            placeholder="Comentar"
            className="h-8 text-sm"
          />
          <button
            disabled
            title="Anexo (em breve)"
            className="p-1.5 text-muted-foreground/50 cursor-not-allowed"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <Button size="sm" onClick={sendComment} disabled={!commentText.trim()} className="h-8 px-3">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <RemindersDialog
        open={remindersOpen}
        onOpenChange={setRemindersOpen}
        taskId={task.id}
      />

      <ScheduleMeetingDialog
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        convertTaskId={task.id}
        defaultTitle={task.title}
        defaultDescription={task.description ?? undefined}
        defaultDate={task.dueDate ?? undefined}
        defaultTime={task.dueTime ?? undefined}
        defaultDuration={task.durationMinutes ?? undefined}
        defaultUserInviteeIds={assigneeIds}
      />
    </div>
  );

  // Portal: side panel (desktop) or fullscreen (mobile)
  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="flex-1 bg-foreground/40 backdrop-blur-sm"
          onClick={close}
          aria-label="Fechar painel"
        />
        <motion.div
          initial={{ x: isMobile ? 0 : 480, y: isMobile ? 60 : 0, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={{ x: isMobile ? 0 : 480, y: isMobile ? 60 : 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className={cn(
            'bg-background shadow-2xl border-l border-border flex flex-col',
            isMobile ? 'w-full' : 'w-[480px]'
          )}
        >
          {content}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: any;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
