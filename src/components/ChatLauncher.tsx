import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChatThread } from '@/components/ChatThread';
import { cn } from '@/lib/utils';
import { useEffect, useMemo } from 'react';

/**
 * Floating left-side chat panel. Toggle via the launcher button at the
 * bottom-left of the app shell. Click "Maximize" to navigate to the
 * dedicated /conversations page.
 */
export function ChatLauncher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const conversations = useChatStore((s) => s.conversations);
  const unread = useChatStore((s) => s.unreadByConversation);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const subscribe = useChatStore((s) => s.subscribeRealtime);
  const unsubscribe = useChatStore((s) => s.unsubscribeRealtime);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const tasks = useTaskStore((s) => s.tasks);

  const totalUnread = useMemo(
    () => Object.values(unread).reduce((a, b) => a + b, 0),
    [unread]
  );

  useEffect(() => {
    if (currentWorkspaceId) {
      fetchConversations(currentWorkspaceId);
      subscribe(currentWorkspaceId);
    }
    return () => unsubscribe();
  }, [currentWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !activeId) {
      const ws = conversations.find((c) => c.type === 'workspace');
      if (ws) setActiveId(ws.id);
    }
  }, [open, conversations, activeId]);

  const taskTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) m.set(t.id, t.title);
    return m;
  }, [tasks]);

  const completedTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) if (t.completed) s.add(t.id);
    return s;
  }, [tasks]);

  const workspaceConvs = conversations.filter((c) => c.type === 'workspace');
  const taskConvs = conversations.filter((c) => {
    if (c.type !== 'task') return false;
    // Esconde tarefas já concluídas
    if (c.taskId && completedTaskIds.has(c.taskId)) return false;
    // Só mostra se houve atividade (alguém mandou mensagem) — trigger toca updated_at
    const hasActivity =
      new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000;
    return hasActivity || (unread[c.id] || 0) > 0;
  });

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg',
          'bg-primary text-primary-foreground flex items-center justify-center',
          'hover:scale-105 transition-transform'
        )}
        aria-label="Abrir conversas"
      >
        <MessageSquare className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center animate-pulse">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: -380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -380, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed bottom-20 right-4 z-40 w-[380px] h-[560px] bg-popover border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          >
            <header className="flex items-center justify-between px-3 py-2 border-b">
              <h3 className="font-semibold text-sm">Conversas</h3>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setOpen(false);
                    navigate(activeId ? `/conversations/${activeId}` : '/conversations');
                  }}
                  title="Abrir em página dedicada"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
              <div className="w-32 border-r overflow-y-auto p-1.5 space-y-2 bg-muted/30">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">Canais</div>
                {workspaceConvs.map((c) => (
                  <MiniConv
                    key={c.id}
                    label={c.title || 'Geral'}
                    active={activeId === c.id}
                    unread={unread[c.id] || 0}
                    onClick={() => setActiveId(c.id)}
                  />
                ))}
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 pt-1">Tarefas</div>
                {taskConvs.length === 0 && (
                  <div className="text-[10px] text-muted-foreground/60 px-1">—</div>
                )}
                {taskConvs.map((c) => (
                  <MiniConv
                    key={c.id}
                    label={(c.taskId && taskTitleMap.get(c.taskId)) || c.title || 'Tarefa'}
                    active={activeId === c.id}
                    unread={unread[c.id] || 0}
                    onClick={() => setActiveId(c.id)}
                  />
                ))}
              </div>

              <div className="flex-1 overflow-hidden">
                {activeId ? (
                  <ChatThread conversationId={activeId} compact />
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Selecione
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MiniConv({
  label,
  active,
  unread,
  onClick,
}: {
  label: string;
  active: boolean;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-1.5 py-1 rounded text-[11px] truncate transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        unread > 0 && !active && 'font-semibold'
      )}
      title={label}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate">{label}</span>
        {unread > 0 && (
          <Badge className="h-3.5 min-w-[14px] px-1 rounded-full text-[8px] bg-destructive text-destructive-foreground animate-pulse">
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </div>
    </button>
  );
}
