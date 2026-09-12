import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Hash, MessageSquare, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';
import { ChatThread } from '@/components/ChatThread';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisibleViewport } from '@/hooks/useVisibleViewport';

export default function ConversationsPage() {
  const isMobile = useIsMobile();
  const { id: routeId } = useParams<{ id?: string }>();
  const mobileConversationOpen = isMobile && !!routeId;
  const viewport = useVisibleViewport(mobileConversationOpen);
  const navigate = useNavigate();
  const conversations = useChatStore((s) => s.conversations);
  const unread = useChatStore((s) => s.unreadByConversation);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const subscribe = useChatStore((s) => s.subscribeRealtime);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const tasks = useTaskStore((s) => s.tasks);

  const [activeId, setActiveId] = useState<string | null>(routeId || null);
  const [showCompleted, setShowCompleted] = useState(false);
  // On mobile the URL distinguishes the list from a selected conversation.
  // Returning to /conversations must not immediately reopen the first channel.
  const selectedId = isMobile ? routeId ?? null : activeId;
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  const openConversation = (id: string) => navigate(`/conversations/${id}`);
  const backToList = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    navigate('/conversations');
  };

  useEffect(() => {
    if (currentWorkspaceId) {
      fetchConversations(currentWorkspaceId);
      subscribe(currentWorkspaceId);
    }
  }, [currentWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (routeId) setActiveId(routeId);
  }, [routeId]);

  const taskById = useMemo(() => {
    const map = new Map<string, { title: string; number: number | null; completed: boolean }>();
    for (const t of tasks) map.set(t.id, { title: t.title, number: t.taskNumber ?? null, completed: t.completed });
    return map;
  }, [tasks]);

  const workspaceConvs = useMemo(
    () => conversations.filter((c) => c.type === 'workspace'),
    [conversations]
  );

  const sortChats = (a: typeof conversations[number], b: typeof conversations[number]) => {
    const ua = (unread[a.id] || 0) > 0 ? 1 : 0;
    const ub = (unread[b.id] || 0) > 0 ? 1 : 0;
    if (ua !== ub) return ub - ua;
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  };

  const activeTaskConvs = useMemo(() => {
    return conversations
      .filter((c) => {
        if (c.type !== 'task' || !c.taskId) return false;
        const t = taskById.get(c.taskId);
        // Mostra se a task NÃO está explicitamente concluída.
        // (inclui casos em que a task ainda não foi carregada no store)
        return !t?.completed;
      })
      .sort(sortChats);
  }, [conversations, taskById, unread]);

  const completedTaskConvs = useMemo(() => {
    return conversations
      .filter((c) => {
        if (c.type !== 'task' || !c.taskId) return false;
        const t = taskById.get(c.taskId);
        // Só joga em "Concluídas" quando temos certeza de que está concluída.
        return !!t && t.completed;
      })
      .sort(sortChats);
  }, [conversations, taskById, unread]);

  // Auto-select first conversation
  useEffect(() => {
    if (isMobile) return;
    if (!activeId && workspaceConvs[0]) setActiveId(workspaceConvs[0].id);
  }, [activeId, workspaceConvs, isMobile]);

  useEffect(() => {
    if (isMobile || !activeId) return;
    const visibleIds = new Set([
      ...workspaceConvs.map((c) => c.id),
      ...activeTaskConvs.map((c) => c.id),
      ...completedTaskConvs.map((c) => c.id),
    ]);
    if (!visibleIds.has(activeId)) {
      const next = workspaceConvs[0]?.id ?? activeTaskConvs[0]?.id ?? null;
      setActiveId(next);
      if (next) navigate(`/conversations/${next}`, { replace: true });
      else navigate('/conversations', { replace: true });
    }
  }, [activeId, workspaceConvs, activeTaskConvs, completedTaskConvs, navigate, isMobile]);

  const conversationTitle = selectedConversation?.taskId
    ? taskById.get(selectedConversation.taskId)?.title || selectedConversation.title || 'Conversa da tarefa'
    : selectedConversation?.title || 'Conversa';

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 overflow-hidden',
        mobileConversationOpen ? 'fixed inset-x-0 z-[35] flex-col bg-background pt-safe pb-safe' : 'h-full flex-1'
      )}
      style={mobileConversationOpen ? { top: viewport.top, height: viewport.height } : undefined}
      aria-label={mobileConversationOpen ? 'Conversa aberta' : 'Conversas'}
    >
      {(!isMobile || !selectedId) && <aside className={cn('min-h-0 min-w-0 flex flex-col bg-card/40', isMobile ? 'w-full' : 'w-72 shrink-0 border-r')} aria-label="Lista de conversas">
        <div className="px-4 py-3 border-b">
          <h2 className="font-display text-base font-semibold">Conversas</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          <div>
            <div className="px-2 mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Canais
            </div>
            <div className="space-y-0.5">
              {workspaceConvs.map((c) => (
                <ConvLink
                  key={c.id}
                  active={selectedId === c.id}
                  unread={unread[c.id] || 0}
                  onClick={() => openConversation(c.id)}
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label={c.title || 'Geral'}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="px-2 mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Tarefas ativas
            </div>
            <div className="space-y-0.5">
              {activeTaskConvs.length === 0 ? (
                <div className="px-2 py-1 text-xs text-muted-foreground/60">
                  Nenhum chat de tarefa ativa.
                </div>
              ) : (
                activeTaskConvs.map((c) => {
                  const t = c.taskId ? taskById.get(c.taskId) : undefined;
                  const label = t?.title || c.title || 'Tarefa';
                  return (
                    <ConvLink
                      key={c.id}
                      active={selectedId === c.id}
                      unread={unread[c.id] || 0}
                      onClick={() => openConversation(c.id)}
                      icon={<MessageSquare className="h-3.5 w-3.5" />}
                      label={label}
                      prefix={t?.number != null ? `#${t.number}` : undefined}
                    />
                  );
                })
              )}
            </div>
          </div>

          {completedTaskConvs.length > 0 && (
            <div>
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="w-full flex items-center gap-1 px-2 mb-1 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCompleted ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>Concluídas ({completedTaskConvs.length})</span>
              </button>
              {showCompleted && (
                <div className="space-y-0.5">
                  {completedTaskConvs.map((c) => {
                    const t = c.taskId ? taskById.get(c.taskId) : undefined;
                    const label = t?.title || c.title || 'Tarefa';
                    return (
                      <ConvLink
                        key={c.id}
                        active={selectedId === c.id}
                        unread={unread[c.id] || 0}
                        onClick={() => openConversation(c.id)}
                        icon={<MessageSquare className="h-3.5 w-3.5 opacity-60" />}
                        label={label}
                        prefix={t?.number != null ? `#${t.number}` : undefined}
                        muted
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>}

      {(!isMobile || selectedId) && <main className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">
        {mobileConversationOpen && (
          <header className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2 py-1">
            <button type="button" onClick={backToList} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:bg-muted" aria-label="Voltar às conversas">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="min-w-0 flex-1 truncate pr-3 text-base font-semibold">{conversationTitle}</h2>
          </header>
        )}
        {selectedId ? (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden [&>div]:min-h-0 [&>div]:min-w-0">
            <ChatThread key={isMobile ? selectedId : 'desktop'} conversationId={selectedId} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        )}
      </main>}
    </div>
  );
}

function ConvLink({
  active,
  unread,
  onClick,
  icon,
  label,
  prefix,
  muted,
}: {
  active: boolean;
  unread: number;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  prefix?: string;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full min-h-14 md:min-h-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-foreground/80',
        unread > 0 && !active && 'font-semibold',
        muted && !active && 'text-foreground/55'
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      {prefix && (
        <span className="text-muted-foreground/70 font-mono text-xs tabular-nums">{prefix}</span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {unread > 0 && (
        <Badge
          className={cn(
            'h-5 min-w-[20px] px-1.5 rounded-full text-[10px] tabular-nums',
            'bg-primary text-primary-foreground animate-pulse'
          )}
        >
          {unread > 99 ? '99+' : unread}
        </Badge>
      )}
    </button>
  );
}
