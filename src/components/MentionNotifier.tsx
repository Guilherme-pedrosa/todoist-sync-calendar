import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { MessageSquare, AtSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Listens for new chat_mention notifications and shows a loud toast.
 * Mounted once at the app layout level.
 */
export function MentionNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!user) return;

    // pre-warm audio (small chime)
    if (typeof Audio !== 'undefined') {
      audioRef.current = new Audio(
        'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
      );
    }

    const channel = supabase
      .channel(`mentions-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;

          if (n.type === 'chat_mention') {
            const snippet: string = n.payload?.snippet || 'Você foi mencionado';
            const conversationId: string | undefined = n.payload?.conversation_id;
            toast(
              <div className="flex items-start gap-2">
                <AtSign className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <div className="font-semibold text-sm">Você foi mencionado</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{snippet}</div>
                </div>
              </div>,
              {
                duration: 8000,
                action: conversationId
                  ? { label: 'Abrir', onClick: () => navigate(`/conversations/${conversationId}`) }
                  : undefined,
                className: 'border-primary/60 ring-2 ring-primary/40 shadow-lg',
              }
            );
          } else if (n.type === 'task_assigned') {
            const title: string = n.payload?.task_title || 'uma tarefa';
            const taskId: string | undefined = n.payload?.task_id;
            toast(
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <div className="font-semibold text-sm">Você é o responsável</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{title}</div>
                </div>
              </div>,
              {
                duration: 8000,
                action: taskId
                  ? { label: 'Abrir', onClick: () => navigate(`/?task=${taskId}`) }
                  : undefined,
                className: 'border-primary/60 ring-2 ring-primary/40 shadow-lg',
              }
            );
          } else {
            return;
          }

          try {
            audioRef.current?.play().catch(() => {});
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  return null;
}
