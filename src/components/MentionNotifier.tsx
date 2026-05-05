import { useEffect } from 'react';
import { toast } from 'sonner';
import { MessageSquare, AtSign, BellRing } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationStore } from '@/store/notificationStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import {
  maybeAutoRequestPermission,
  playChime,
  showSystemNotification,
} from '@/lib/browserNotifications';

/**
 * Listens for new notifications via the notification store and surfaces them as:
 *  - Loud in-app toast (Sonner) with action button
 *  - System tray notification (when tab is hidden and permission granted)
 *  - Audible chime
 */
export function MentionNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const subscribe = useNotificationStore((s) => s.subscribe);
  const openTaskDetail = useTaskDetailStore((s) => s.open);
  const unsubscribe = useNotificationStore((s) => s.unsubscribe);
  const fetchAll = useNotificationStore((s) => s.fetch);
  const markRead = useNotificationStore((s) => s.markRead);
  const items = useNotificationStore((s) => s.items);

  // Bootstrap fetch + subscribe + permission
  useEffect(() => {
    if (!user) return;
    fetchAll();
    subscribe(user.id);
    maybeAutoRequestPermission();
    return () => unsubscribe();
  }, [user, fetchAll, subscribe, unsubscribe]);

  // React to newly-arrived notifications (cheap diff via known IDs)
  useEffect(() => {
    if (!user) return;
    const seenKey = `__notif_seen_${user.id}`;
    const seen: Set<string> = ((window as any)[seenKey] ||= new Set<string>());

    for (const n of items) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      // Skip already-read (e.g. coming from initial fetch)
      if (n.readAt) continue;
      // Skip stale (>30s old at first mount)
      if (Date.now() - new Date(n.createdAt).getTime() > 30_000 && seen.size <= items.length) {
        continue;
      }

      const handleOpen = () => {
        markRead(n.id);
        if (n.type === 'chat_mention' && n.payload?.conversation_id) {
          navigate(`/conversations/${n.payload.conversation_id}`);
        } else if ((n.type === 'task_assigned' || n.type === 'task_reminder') && n.payload?.task_id) {
          navigate(`/?task=${n.payload.task_id}`);
        }
      };

      if (n.type === 'chat_mention') {
        const snippet: string = n.payload?.snippet || 'Você foi mencionado';
        toast(
          <div className="flex items-start gap-2">
            <AtSign className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="font-semibold text-sm">Você foi mencionado</div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {snippet}
              </div>
            </div>
          </div>,
          {
            duration: 8000,
            action: { label: 'Abrir', onClick: handleOpen },
            className: 'border-primary/60 ring-2 ring-primary/40 shadow-lg',
          }
        );
        showSystemNotification({
          title: 'Você foi mencionado',
          body: snippet,
          tag: `mention-${n.id}`,
          onClick: handleOpen,
        });
        playChime();
      } else if (n.type === 'task_assigned') {
        const title: string = n.payload?.task_title || 'uma tarefa';
        toast(
          <div className="flex items-start gap-2">
            <MessageSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="font-semibold text-sm">Você é o responsável</div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {title}
              </div>
            </div>
          </div>,
          {
            duration: 8000,
            action: { label: 'Abrir', onClick: handleOpen },
            className: 'border-primary/60 ring-2 ring-primary/40 shadow-lg',
          }
        );
        showSystemNotification({
          title: 'Nova tarefa atribuída',
          body: title,
          tag: `task-${n.id}`,
          onClick: handleOpen,
        });
        playChime();
      } else if (n.type === 'task_reminder') {
        const title: string = n.payload?.task_title || 'uma tarefa';
        toast(
          <div className="flex items-start gap-2">
            <BellRing className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="font-semibold text-sm">Lembrete de tarefa</div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {title}
              </div>
            </div>
          </div>,
          {
            duration: 8000,
            action: { label: 'Abrir', onClick: handleOpen },
            className: 'border-primary/60 ring-2 ring-primary/40 shadow-lg',
          }
        );
        showSystemNotification({
          title: 'Lembrete de tarefa',
          body: title,
          tag: `reminder-${n.id}`,
          onClick: handleOpen,
        });
        playChime();
      }
    }
  }, [items, user, navigate, markRead]);

  return null;
}
