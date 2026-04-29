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
  const ensureTaskConversation = useChatStore((s) => s.ensureTaskConversation);
  const conversations = useChatStore((s) => s.conversations);
  const unread = useChatStore((s) => s.unreadByConversation);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const id = await ensureTaskConversation(taskId);
      if (active) setConversationId(id);
    })();
    return () => {
      active = false;
    };
  }, [taskId, ensureTaskConversation, conversations.length]);

  const unreadCount = conversationId ? unread[conversationId] || 0 : 0;

  if (!conversationId) {
    return null; // tarefa sem workspace compartilhado → sem conversa
  }

  return (
    <>
      <div className="pt-4 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => setOpen(true)}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Conversa da tarefa</span>
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
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <ChatThread conversationId={conversationId} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
