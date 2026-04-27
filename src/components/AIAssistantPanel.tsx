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
} from '@/lib/aiAssistant';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

const todayString = () => format(new Date(), 'yyyy-MM-dd');

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
      </SheetContent>
    </Sheet>
  );
}

// -------------- Análise --------------
function AnalyzeTab({ tasks, projects }: { tasks: any[]; projects: any[] }) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setText(null);
    try {
      const r = await analyzeDay({ date, tasks, projects });
      setText(r.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na análise');
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
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Analisar
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5">
          {!text && !loading && (
            <div className="text-sm text-muted-foreground text-center py-12">
              <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-40" />
              Clique em <strong>Analisar</strong> para uma visão da sua agenda em{' '}
              {format(new Date(date + 'T12:00'), "d 'de' MMMM", { locale: ptBR })}.
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando seu dia...
            </div>
          )}
          {text && (
            <article className="prose prose-sm prose-invert max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground">
              <ReactMarkdown>{text}</ReactMarkdown>
            </article>
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
        : 'A IA respondeu vazio. Tente reformular a pergunta.';
      setMessages([...next, { role: 'assistant', content: replyText }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'IA indisponível agora, tente em alguns segundos.');
      setMessages(next.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-5 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="mb-3">Pergunte qualquer coisa sobre sua agenda:</p>
              <div className="space-y-1.5 text-xs">
                <Suggestion onClick={(s) => setInput(s)}>
                  Quando tenho 1h livre essa semana?
                </Suggestion>
                <Suggestion onClick={(s) => setInput(s)}>
                  Que tarefas posso adiar para amanhã?
                </Suggestion>
                <Suggestion onClick={(s) => setInput(s)}>
                  Qual a melhor hora para focar em algo difícil hoje?
                </Suggestion>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-muted/60',
              )}
            >
              {m.role === 'assistant' ? (
                <article className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-1 prose-ul:my-1 prose-li:my-0">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </article>
              ) : (
                m.content
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
          placeholder="Pergunte algo sobre sua agenda..."
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
