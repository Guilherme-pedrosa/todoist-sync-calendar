import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Hash, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';
import { ChatThread } from '@/components/ChatThread';
import { Badge } from '@/components/ui/badge';

export default function ConversationsPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const conversations = useChatStore((s) => s.conversations);
  const unread = useChatStore((s) => s.unreadByConversation);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const subscribe = useChatStore((s) => s.subscribeRealtime);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const tasks = useTaskStore((s) => s.tasks);

  const [activeId, setActiveId] = useState<string | null>(routeId || null);
  const [showCompleted, setShowCompleted] = useState(false);

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
        // Só mostra se task carregada e NÃO concluída.
        return !!t && !t.completed;
      })
      .sort(sortChats);
  }, [conversations, taskById, unread]);

  const completedTaskConvs = useMemo(() => {
    return conversations
      .filter((c) => {
        if (c.type !== 'task' || !c.taskId) return false;
        const t = taskById.get(c.taskId);
        // Concluídas OU órfãs (task fora de escopo) → histórico.
        return !t || t.completed;
      })
      .sort(sortChats);
  }, [conversations, taskById, unread]);

  // Auto-select first conversation
  useEffect(() => {
    if (!activeId && workspaceConvs[0]) setActiveId(workspaceConvs[0].id);
  }, [activeId, workspaceConvs]);

  return (
    <div className="flex h-full">
      <aside className="w-72 border-r flex flex-col bg-card/40">
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
                  active={activeId === c.id}
                  unread={unread[c.id] || 0}
                  onClick={() => navigate(`/conversations/${c.id}`)}
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
                      active={activeId === c.id}
                      unread={unread[c.id] || 0}
                      onClick={() => navigate(`/conversations/${c.id}`)}
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
                        active={activeId === c.id}
                        unread={unread[c.id] || 0}
                        onClick={() => navigate(`/conversations/${c.id}`)}
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
      </aside>

      <main className="flex-1 flex flex-col">
        {activeId ? (
          <ChatThread conversationId={activeId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        )}
      </main>
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
}: {
  active: boolean;
  unread: number;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  prefix?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-foreground/80',
        unread > 0 && !active && 'font-semibold'
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      {prefix && (
        <span className="text-muted-foreground/70 font-mono text-xs tabular-nums">{prefix}</span>
      )}
      <span className="flex-1 truncate">{label}</span>
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
