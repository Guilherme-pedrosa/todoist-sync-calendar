import { useEffect } from 'react';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { onIncomingChatMessage } from '@/store/chatStore';
import {
  maybeAutoRequestPermission,
  playChime,
  showSystemNotification,
} from '@/lib/browserNotifications';
import { notifyTabUnread, clearTabBlink } from '@/lib/titleBlink';

/**
 * Reage a NOVAS mensagens de chat (não suas) — toast, chime, notificação do sistema
 * e título piscando na aba quando ela está oculta/sem foco.
 */
export function ChatNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    maybeAutoRequestPermission();

    const off = onIncomingChatMessage((e) => {
      const title =
        e.conversationTitle ||
        (e.conversationType === 'task' ? 'Conversa da tarefa' : 'Nova mensagem');
      const snippet = (e.message.body || '').replace(/\s+/g, ' ').slice(0, 140) || 'Nova mensagem';

      const open = () => {
        clearTabBlink();
        if (e.conversationType === 'task' && e.taskId) {
          navigate(`/?task=${e.taskId}`);
        } else {
          navigate(`/conversations/${e.message.conversationId}`);
        }
      };

      // Toast in-app
      toast(
        <div className="flex items-start gap-2">
          <MessageSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            <div className="font-semibold text-sm">{title}</div>
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{snippet}</div>
          </div>
        </div>,
        {
          duration: 6000,
          action: { label: 'Abrir', onClick: open },
          className: 'border-primary/60 ring-2 ring-primary/40 shadow-lg',
        }
      );

      // Notificação do sistema (só quando aba está oculta/sem foco)
      showSystemNotification({
        title,
        body: snippet,
        tag: `chat-${e.message.conversationId}`,
        onClick: open,
      });

      // Chime + título piscando
      playChime();
      notifyTabUnread();
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') clearTabBlink();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', clearTabBlink);

    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', clearTabBlink);
    };
  }, [user, navigate]);

  return null;
}
