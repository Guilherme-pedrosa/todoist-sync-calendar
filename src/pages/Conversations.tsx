import { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { Hash, MessageSquare, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';
import { ChatThread } from '@/components/ChatThread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

  useEffect(() => {
    if (currentWorkspaceId) {
      fetchConversations(currentWorkspaceId);
      subscribe(currentWorkspaceId);
    }
  }, [currentWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (routeId) setActiveId(routeId);
  }, [routeId]);

  const workspaceConvs = useMemo(
    () => conversations.filter((c) => c.type === 'workspace'),
    [conversations]
  );
  const taskConvs = useMemo(
    () => conversations.filter((c) => c.type === 'task'),
    [conversations]
  );

  // Auto-select first conversation
  useEffect(() => {
    if (!activeId && workspaceConvs[0]) setActiveId(workspaceConvs[0].id);
  }, [activeId, workspaceConvs]);

  const taskTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) map.set(t.id, t.title);
    return map;
  }, [tasks]);

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
              Tarefas
            </div>
            <div className="space-y-0.5">
              {taskConvs.length === 0 ? (
                <div className="px-2 py-1 text-xs text-muted-foreground/60">
                  Nenhuma conversa de tarefa ainda.
                </div>
              ) : (
                taskConvs.map((c) => (
                  <ConvLink
                    key={c.id}
                    active={activeId === c.id}
                    unread={unread[c.id] || 0}
                    onClick={() => navigate(`/conversations/${c.id}`)}
                    icon={<MessageSquare className="h-3.5 w-3.5" />}
                    label={(c.taskId && taskTitleMap.get(c.taskId)) || c.title || 'Tarefa'}
                  />
                ))
              )}
            </div>
          </div>
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
}: {
  active: boolean;
  unread: number;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
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
