import { useEffect, useState } from 'react';
import { MessageSquare, X, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ChatThread } from '@/components/ChatThread';
import { useChatStore } from '@/store/chatStore';

interface Props {
  taskId: string;
}

export function TaskConversationButton({ taskId }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ensureTaskConversation = useChatStore((s) => s.ensureTaskConversation);
  const conversations = useChatStore((s) => s.conversations);
  const unread = useChatStore((s) => s.unreadByConversation);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Tenta carregar a conversa existente (sem criar) ao montar
  useEffect(() => {
    let active = true;
    const existing = conversations.find((c) => c.taskId === taskId);
    if (existing) {
      setConversationId(existing.id);
      return;
    }
    return () => {
      active = false;
    };
  }, [taskId, conversations]);

  const unreadCount = conversationId ? unread[conversationId] || 0 : 0;

  const handleOpen = async () => {
    if (conversationId) {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const id = await ensureTaskConversation(taskId);
      if (id) {
        setConversationId(id);
        setOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="pt-4 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleOpen}
          disabled={loading}
        >
          <MessageSquare className="h-4 w-4" />
          <span>{loading ? 'Abrindo conversa...' : 'Conversa da tarefa'}</span>
          {unreadCount > 0 && (
            <Badge className="ml-auto h-5 min-w-[20px] px-1.5 rounded-full text-[10px] bg-primary text-primary-foreground animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm">Conversa da tarefa</SheetTitle>
              {conversationId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/conversations/${conversationId}`);
                  }}
                  title="Abrir em página dedicada"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {conversationId ? (
              <ChatThread conversationId={conversationId} />
            ) : (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Não foi possível abrir a conversa desta tarefa.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
