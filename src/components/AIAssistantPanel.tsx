import { useEffect, useMemo, useRef, useState } from 'react';
import { useAIAssistantStore } from '@/store/aiAssistantStore';
import { useTaskStore } from '@/store/taskStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AIAssistantErrorBoundary } from '@/components/AIAssistantErrorBoundary';
import {
  Sparkles,
  Send,
  Loader2,
  CalendarDays,
  Wand2,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import {
  analyzeDay,
  chatWithAssistant,
  organizeDay,
  type AssistantAction,
} from '@/lib/aiAssistant';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  actions?: AssistantAction[];
  actionsState?: 'pending' | 'applied' | 'discarded';
};

const todayString = () => format(new Date(), 'yyyy-MM-dd');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidIsoDate = (s: string | null | undefined): s is string => {
  if (!s || typeof s !== 'string') return false;
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(s + 'T12:00:00');
  return !Number.isNaN(d.getTime());
};

const safeFormatDate = (s: string, fmt: string): string => {
  try {
    if (!isValidIsoDate(s)) return s;
    return format(new Date(s + 'T12:00:00'), fmt, { locale: ptBR });
  } catch {
    return s;
  }
};

function DebugJson({ request, response }: { request: unknown; response: unknown }) {
  return (
    <Collapsible className="mt-6 border-t border-border/60 pt-3">
      <CollapsibleTrigger className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
        ▸ Ver JSON (debug)
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Request
          </div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-words bg-muted/40 border border-border rounded-md p-2 max-h-60 overflow-auto">
{JSON.stringify(request, null, 2)}
          </pre>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Response
          </div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-words bg-muted/40 border border-border rounded-md p-2 max-h-60 overflow-auto">
{JSON.stringify(response, null, 2)}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const isPastTodaySlot = (date: string, time?: string | null) => {
  if (!time || date !== todayString()) return false;
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  const now = new Date();
  const minAllowed = Math.ceil((now.getHours() * 60 + now.getMinutes() + 5) / 15) * 15;
  return h * 60 + m < minAllowed;
};

export function AIAssistantPanel() {
  const isOpen = useAIAssistantStore((s) => s.isOpen);
  const initialTab = useAIAssistantStore((s) => s.initialTab);
  const close = useAIAssistantStore((s) => s.close);
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useTaskStore((s) => s.projects);
  const updateTask = useTaskStore((s) => s.updateTask);

  const [tab, setTab] = useState<'chat' | 'analyze' | 'organize'>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab, isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[440px] p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 font-display">
            <Sparkles className="h-5 w-5 text-primary" />
            Assistente IA
          </SheetTitle>
          <SheetDescription className="text-xs">
            Powered by Gemini · Te ajuda a organizar seu dia
          </SheetDescription>
        </SheetHeader>

        <AIAssistantErrorBoundary onReset={() => setTab(initialTab)}>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as typeof tab)}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="mx-5 mt-3 grid grid-cols-3">
              <TabsTrigger value="analyze" className="text-xs gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Análise
              </TabsTrigger>
              <TabsTrigger value="organize" className="text-xs gap-1">
                <Wand2 className="h-3.5 w-3.5" /> Organizar
              </TabsTrigger>
              <TabsTrigger value="chat" className="text-xs gap-1">
                <MessageSquare className="h-3.5 w-3.5" /> Chat
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analyze" className="flex-1 min-h-0 m-0">
              <AnalyzeTab tasks={tasks} projects={projects} />
            </TabsContent>

            <TabsContent value="organize" className="flex-1 min-h-0 m-0">
              <OrganizeTab
                tasks={tasks}
                projects={projects}
                onApply={(assignments) => {
                  let applied = 0;
                  for (const a of assignments) {
                    updateTask(a.id, {
                      dueDate: a.date,
                      dueTime: a.time,
                      durationMinutes: a.durationMinutes,
                    });
                    applied++;
                  }
                  toast.success(`${applied} tarefas organizadas pela IA`);
                }}
              />
            </TabsContent>

            <TabsContent value="chat" className="flex-1 min-h-0 m-0">
              <ChatTab tasks={tasks} projects={projects} />
            </TabsContent>
          </Tabs>
        </AIAssistantErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}

// -------------- Análise --------------
function AnalyzeTab({ tasks, projects }: { tasks: any[]; projects: any[] }) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [debug, setDebug] = useState<{ request: unknown; response: unknown } | null>(null);

  const dateValid = isValidIsoDate(date);

  const run = async () => {
    if (!dateValid) return;
    setLoading(true);
    setText(null);
    setDebug(null);
    const requestPayload = { action: 'analyze-day', date, taskCount: tasks.length, projectCount: projects.length };
    try {
      const r = await analyzeDay({ date, tasks, projects });
      setText(r.text);
      setDebug({ request: requestPayload, response: r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha na análise';
      setDebug({ request: requestPayload, response: { error: msg } });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            min={todayString()}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!dateValid}
            className={cn(
              'bg-muted/40 border rounded-md text-xs h-8 px-2 flex-1',
              dateValid ? 'border-border' : 'border-destructive',
            )}
          />
          <Button
            size="sm"
            onClick={run}
            disabled={loading || !dateValid}
            className="h-8 gap-1.5"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analisar
          </Button>
        </div>
        {!dateValid && (
          <div className="mt-2 text-[11px] text-destructive">
            Data inválida. Selecione um dia no calendário.
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5">
          {!text && !loading && (
            <div className="text-sm text-muted-foreground text-center py-12">
              <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-40" />
              Clique em <strong>Analisar</strong> para uma visão da sua agenda
              {dateValid ? ` em ${safeFormatDate(date, "d 'de' MMMM")}.` : '.'}
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando seu dia...
            </div>
          )}
          {text && (
            <article className="prose prose-sm prose-invert max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground">
              <ReactMarkdown>{text || ''}</ReactMarkdown>
            </article>
          )}
          {debug && !loading && (
            <DebugJson request={debug.request} response={debug.response} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// -------------- Organizar --------------
function OrganizeTab({
  tasks,
  projects,
  onApply,
}: {
  tasks: any[];
  projects: any[];
  onApply: (a: { id: string; date: string; time: string; durationMinutes: number }[]) => void;
}) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    assignments: { id: string; date: string; time: string; durationMinutes: number }[];
    summary: string;
  } | null>(null);

  // Tarefas do dia sem horário (candidatas à organização)
  const candidates = useMemo(() => {
    return tasks.filter(
      (t) => !t.completed && !t.parentId && t.dueDate === date && !t.dueTime,
    );
  }, [tasks, date]);

  const run = async () => {
    if (candidates.length === 0) {
      toast.info('Nenhuma tarefa sem horário neste dia.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await organizeDay({
        date,
        unscheduled: candidates.map((t) => ({
          id: t.id,
          title: t.title,
          durationMinutes: t.durationMinutes,
          priority: t.priority,
          project: projects.find((p) => p.id === t.projectId)?.name,
        })),
        tasks,
        projects,
      });
      const assignments = r.assignments.filter((a) => !isPastTodaySlot(a.date, a.time));
      if (assignments.length !== r.assignments.length) {
        toast.warning('Removi sugestões da IA que caíam em horário passado.');
      }
      if (assignments.length === 0) {
        toast.error('A IA não encontrou horários futuros válidos para este dia.');
        return;
      }
      setResult({ ...r, assignments });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao organizar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 flex items-center gap-2 border-b border-border/60">
        <input
          type="date"
          value={date}
          min={todayString()}
          onChange={(e) => setDate(e.target.value)}
          className="bg-muted/40 border border-border rounded-md text-xs h-8 px-2 flex-1"
        />
        <Button size="sm" onClick={run} disabled={loading} className="h-8 gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Organizar
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {!result && !loading && (
            <>
              <p className="text-xs text-muted-foreground">
                A IA vai pegar as tarefas <strong>sem horário</strong> deste dia e
                distribuir em blocos livres respeitando a sua agenda.
              </p>
              <div className="text-xs">
                <div className="font-medium mb-2">
                  {candidates.length} tarefa(s) candidata(s):
                </div>
                {candidates.length === 0 ? (
                  <div className="text-muted-foreground italic">Nenhuma — tudo já tem horário.</div>
                ) : (
                  <ul className="space-y-1">
                    {candidates.map((t) => (
                      <li key={t.id} className="text-muted-foreground">
                        • {t.title} {t.durationMinutes ? `(${t.durationMinutes}min)` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Encaixando suas tarefas...
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground italic">{result.summary}</div>
              <div className="space-y-1.5">
                {result.assignments.map((a) => {
                  const t = tasks.find((x) => x.id === a.id);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-md border border-border p-2.5 text-sm"
                    >
                      <div className="font-mono text-xs text-primary font-medium w-12 shrink-0">
                        {a.time}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{t?.title ?? a.id}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {a.durationMinutes} min
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                className="w-full gap-1.5"
                onClick={() => {
                  onApply(result.assignments);
                  setResult(null);
                }}
              >
                <CheckCircle2 className="h-4 w-4" /> Aplicar ao calendário
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// -------------- Chat --------------
function ChatTab({ tasks, projects }: { tasks: any[]; projects: any[] }) {
  const addTask = useTaskStore((s) => s.addTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const r = await chatWithAssistant({ messages: next, tasks, projects });
      const replyText = (r && typeof r.text === 'string' && r.text.trim())
        ? r.text
        : (r?.actions?.length
            ? 'Preparei as ações abaixo. Confirma?'
            : 'A IA respondeu vazio. Tente reformular a pergunta.');
      const actions = Array.isArray(r?.actions) ? r.actions : [];
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: replyText,
          actions: actions.length ? actions : undefined,
          actionsState: actions.length ? 'pending' : undefined,
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'IA indisponível agora, tente em alguns segundos.');
      setMessages(next.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  const applyActions = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg?.actions?.length) return;
    let ok = 0;
    let fail = 0;
    for (const action of msg.actions) {
      try {
        if (action.type === 'create_task') {
          await addTask({
            title: action.args.title,
            description: action.args.description,
            priority: (action.args.priority as any) ?? 4,
            dueDate: action.args.date,
            dueTime: action.args.time,
            durationMinutes: action.args.durationMinutes ?? null,
            projectId: action.args.projectId,
            recurrenceRule: action.args.recurrenceRule ?? null,
          } as any);
        } else if (action.type === 'update_task') {
          const updates: Record<string, any> = {};
          if (action.args.title !== undefined) updates.title = action.args.title;
          if (action.args.description !== undefined) updates.description = action.args.description;
          if (action.args.clearDate) updates.dueDate = null;
          else if (action.args.date !== undefined) updates.dueDate = action.args.date;
          if (action.args.clearTime) updates.dueTime = null;
          else if (action.args.time !== undefined) updates.dueTime = action.args.time;
          if (action.args.durationMinutes !== undefined) updates.durationMinutes = action.args.durationMinutes;
          if (action.args.priority !== undefined) updates.priority = action.args.priority;
          if (action.args.projectId !== undefined) updates.projectId = action.args.projectId;
          await updateTask(action.args.taskId, updates);
        } else if (action.type === 'complete_task') {
          await toggleTask(action.args.taskId);
        } else if (action.type === 'delete_task') {
          await deleteTask(action.args.taskId);
        }
        ok++;
      } catch (err) {
        console.error('Falha ao aplicar ação', action, err);
        fail++;
      }
    }
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actionsState: 'applied' } : m)),
    );
    if (fail === 0) toast.success(`${ok} ação(ões) aplicada(s).`);
    else toast.warning(`${ok} aplicada(s), ${fail} falharam.`);
  };

  const discardActions = (msgIndex: number) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actionsState: 'discarded' } : m)),
    );
  };

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-5 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="mb-3">Pergunte ou peça uma ação:</p>
              <div className="space-y-1.5 text-xs">
                <Suggestion onClick={(s) => setInput(s)}>
                  Cria tarefa "Pagar boleto" sexta 14h prioridade alta
                </Suggestion>
                <Suggestion onClick={(s) => setInput(s)}>
                  Move o almoço de amanhã para 13h
                </Suggestion>
                <Suggestion onClick={(s) => setInput(s)}>
                  Conclui a primeira tarefa de hoje
                </Suggestion>
                <Suggestion onClick={(s) => setInput(s)}>
                  Quando tenho 1h livre essa semana?
                </Suggestion>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="space-y-2">
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : 'bg-muted/60',
                )}
              >
                {m.role === 'assistant' ? (
                  <article className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-1 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{m.content || ''}</ReactMarkdown>
                  </article>
                ) : (
                  m.content
                )}
              </div>
              {m.actions && m.actions.length > 0 && (
                <ActionProposalCard
                  actions={m.actions}
                  state={m.actionsState ?? 'pending'}
                  tasks={tasks}
                  projects={projects}
                  onApply={() => applyActions(i)}
                  onDiscard={() => discardActions(i)}
                />
              )}
            </div>
          ))}
          {loading && (
            <div className="bg-muted/60 rounded-lg px-3 py-2 text-sm max-w-[85%] flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando...
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-border p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pergunte ou peça uma ação..."
          className="min-h-[40px] max-h-[120px] text-sm resize-none"
          rows={1}
        />
        <Button
          size="icon"
          onClick={send}
          disabled={loading || !input.trim()}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ActionProposalCard({
  actions,
  state,
  tasks,
  projects,
  onApply,
  onDiscard,
}: {
  actions: AssistantAction[];
  state: 'pending' | 'applied' | 'discarded';
  tasks: any[];
  projects: any[];
  onApply: () => void;
  onDiscard: () => void;
}) {
  const taskTitle = (id?: string) =>
    id ? tasks.find((t) => t.id === id)?.title ?? `(id ${id.slice(0, 6)}…)` : '';
  const projectName = (id?: string) =>
    id ? projects.find((p) => p.id === id)?.name ?? '' : '';

  const describe = (a: AssistantAction): { icon: string; label: string; detail?: string } => {
    if (a.type === 'create_task') {
      const bits = [
        a.args.date ? a.args.date : null,
        a.args.time ? a.args.time : null,
        a.args.priority ? `P${a.args.priority}` : null,
        a.args.projectId ? projectName(a.args.projectId) : null,
      ].filter(Boolean);
      return { icon: '➕', label: `Criar: ${a.args.title}`, detail: bits.join(' · ') || undefined };
    }
    if (a.type === 'update_task') {
      const bits: string[] = [];
      if (a.args.title) bits.push(`título → "${a.args.title}"`);
      if (a.args.clearDate) bits.push('remover data');
      else if (a.args.date) bits.push(`data → ${a.args.date}`);
      if (a.args.clearTime) bits.push('remover horário');
      else if (a.args.time) bits.push(`hora → ${a.args.time}`);
      if (a.args.durationMinutes !== undefined) bits.push(`duração → ${a.args.durationMinutes}min`);
      if (a.args.priority !== undefined) bits.push(`prioridade → P${a.args.priority}`);
      if (a.args.projectId) bits.push(`projeto → ${projectName(a.args.projectId)}`);
      return { icon: '✏️', label: `Editar: ${taskTitle(a.args.taskId)}`, detail: bits.join(', ') };
    }
    if (a.type === 'complete_task') {
      return { icon: '✅', label: `Concluir: ${taskTitle(a.args.taskId)}` };
    }
    return { icon: '🗑️', label: `Excluir: ${taskTitle(a.args.taskId)}` };
  };

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2 max-w-[95%]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {actions.length} ação(ões) propostas
      </div>
      <div className="space-y-1.5">
        {actions.map((a, idx) => {
          const d = describe(a);
          return (
            <div key={idx} className="text-xs flex gap-2">
              <span className="shrink-0">{d.icon}</span>
              <div className="min-w-0">
                <div className="font-medium truncate">{d.label}</div>
                {d.detail && <div className="text-muted-foreground">{d.detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {state === 'pending' && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-8 gap-1.5" onClick={onApply}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
          </Button>
          <Button size="sm" variant="ghost" className="flex-1 h-8" onClick={onDiscard}>
            Descartar
          </Button>
        </div>
      )}
      {state === 'applied' && (
        <div className="text-xs text-primary flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Aplicado
        </div>
      )}
      {state === 'discarded' && (
        <div className="text-xs text-muted-foreground italic">Descartado</div>
      )}
    </div>
  );
}

function Suggestion({
  children,
  onClick,
}: {
  children: string;
  onClick: (s: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(children)}
      className="block w-full text-left px-3 py-1.5 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors"
    >
      {children}
    </button>
  );
}
