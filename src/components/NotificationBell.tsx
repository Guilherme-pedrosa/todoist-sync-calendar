import { useMemo, useState } from 'react';
import { Bell, BellRing, AtSign, MessageSquare, CheckCheck, BellOff, CalendarCheck, CalendarX, Video, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotificationStore, type AppNotification } from '@/store/notificationStore';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '@/lib/browserNotifications';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const navigate = useNavigate();
  const items = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermission()
  );

  const unreadCount = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

  const handleClick = (n: AppNotification) => {
    markRead(n.id);
    setOpen(false);
    if (n.type === 'chat_mention' && n.payload?.conversation_id) {
      navigate(`/conversations/${n.payload.conversation_id}`);
    } else if (
      (n.type === 'task_assigned' ||
        n.type === 'task_reminder' ||
        n.type === 'meeting_invite' ||
        n.type === 'meeting_accepted' ||
        n.type === 'meeting_declined') &&
      n.payload?.task_id
    ) {
      navigate(`/?task=${n.payload.task_id}`);
    }
  };

  const askPermission = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notificações"
        >
          {unreadCount > 0 ? (
            <BellRing className="h-[18px] w-[18px] text-primary" />
          ) : (
            <Bell className="h-[18px] w-[18px]" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="font-display font-semibold text-sm">Notificações</div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Marcar todas
            </Button>
          )}
        </div>

        {perm === 'default' && (
          <button
            onClick={askPermission}
            className="w-full flex items-center gap-2 px-3 py-2 border-b bg-primary/5 hover:bg-primary/10 text-left text-xs"
          >
            <BellRing className="h-4 w-4 text-primary shrink-0" />
            <span>
              <span className="font-medium text-foreground">Ativar alertas do sistema</span>
              <span className="text-muted-foreground block">
                Receba notificações mesmo com a aba em segundo plano.
              </span>
            </span>
          </button>
        )}

        {perm === 'denied' && (
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 text-xs text-muted-foreground">
            <BellOff className="h-3.5 w-3.5 shrink-0" />
            <span>
              Notificações bloqueadas no navegador. Habilite nas configurações do site.
            </span>
          </div>
        )}

        <div className="max-h-[380px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nenhuma notificação ainda.
            </div>
          ) : (
            items.map((n) => <Item key={n.id} n={n} onClick={() => handleClick(n)} />)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Item({ n, onClick }: { n: AppNotification; onClick: () => void }) {
  const isMention = n.type === 'chat_mention';
  const isAssigned = n.type === 'task_assigned';
  const isReminder = n.type === 'task_reminder';
  const isInvite = n.type === 'meeting_invite';
  const isAccepted = n.type === 'meeting_accepted';
  const isDeclined = n.type === 'meeting_declined';
  const [busy, setBusy] = useState(false);

  const Icon = isMention
    ? AtSign
    : isInvite
      ? Video
      : isAccepted
        ? CalendarCheck
        : isDeclined
          ? CalendarX
          : MessageSquare;

  const title = isMention
    ? 'Você foi mencionado'
    : isAssigned
      ? 'Você é o responsável'
      : isReminder
        ? 'Lembrete de tarefa'
        : isInvite
          ? 'Convite para reunião'
          : isAccepted
            ? `${n.payload?.invitee_name || 'Convidado'} aceitou`
            : isDeclined
              ? `${n.payload?.invitee_name || 'Convidado'} recusou`
              : 'Notificação';

  const body = n.payload?.snippet || n.payload?.task_title || '';

  const respond = async (status: 'accepted' | 'declined') => {
    if (!n.payload?.invitation_id) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('meeting_invitations')
        .update({ status })
        .eq('id', n.payload.invitation_id);
      if (error) throw error;
      toast.success(status === 'accepted' ? 'Convite aceito' : 'Convite recusado');
    } catch (e: any) {
      toast.error('Falha ao responder', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'w-full flex flex-col gap-2 px-3 py-2.5 border-b last:border-b-0 transition-colors',
        n.readAt ? 'hover:bg-accent/40' : 'bg-primary/5 hover:bg-primary/10'
      )}
    >
      <button onClick={onClick} className="w-full flex items-start gap-2.5 text-left">
        <div
          className={cn(
            'mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0',
            n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('text-sm', !n.readAt && 'font-semibold')}>{title}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(parseISO(n.createdAt), { addSuffix: false, locale: ptBR })}
            </span>
          </div>
          {body && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{body}</div>}
          {isInvite && n.payload?.due_at && (
            <div className="text-[11px] text-primary mt-0.5">
              {format(parseISO(n.payload.due_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
            </div>
          )}
        </div>
        {!n.readAt && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
      </button>

      {isInvite && (
        <div className="flex gap-1.5 pl-9">
          <Button
            size="sm"
            variant="default"
            disabled={busy}
            onClick={() => respond('accepted')}
            className="h-7 text-xs gap-1"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Aceitar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => respond('declined')}
            className="h-7 text-xs gap-1"
          >
            <X className="h-3 w-3" />
            Recusar
          </Button>
        </div>
      )}
    </div>
  );
}

