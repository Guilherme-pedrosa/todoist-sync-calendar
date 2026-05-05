import { useMemo, useState } from 'react';
import { Bell, BellRing, AtSign, MessageSquare, CheckCheck, BellOff, CalendarCheck, CalendarX, Video, Check, X, Loader2, CalendarClock, Undo2, UserCheck, UserX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotificationStore, type AppNotification } from '@/store/notificationStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '@/lib/browserNotifications';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const navigate = useNavigate();
  const openTaskDetail = useTaskDetailStore((s) => s.open);
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
        n.type === 'task_assignment_accepted' ||
        n.type === 'task_assignment_declined' ||
        n.type === 'task_assignment_returned' ||
        n.type === 'task_reminder' ||
        n.type === 'meeting_invite' ||
        n.type === 'meeting_accepted' ||
        n.type === 'meeting_declined' ||
        n.type === 'meeting_proposed') &&
      n.payload?.task_id
    ) {
      openTaskDetail(n.payload.task_id);
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
            items.map((n) => <Item key={n.id} n={n} onClick={() => handleClick(n)} onClose={() => setOpen(false)} />)
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
  const isProposed = n.type === 'meeting_proposed';
  const isAssignAccepted = n.type === 'task_assignment_accepted';
  const isAssignDeclined = n.type === 'task_assignment_declined';
  const isAssignReturned = n.type === 'task_assignment_returned';
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [reasonMode, setReasonMode] = useState<null | 'declined' | 'returned'>(null);
  const [reason, setReason] = useState('');
  const [propDate, setPropDate] = useState<string>(
    n.payload?.due_at ? format(parseISO(n.payload.due_at), 'yyyy-MM-dd') : ''
  );
  const [propTime, setPropTime] = useState<string>(
    n.payload?.due_at ? format(parseISO(n.payload.due_at), 'HH:mm') : ''
  );
  const [propMsg, setPropMsg] = useState('');

  const Icon = isMention
    ? AtSign
    : isInvite
      ? Video
      : isAccepted
        ? CalendarCheck
        : isDeclined
          ? CalendarX
          : isProposed
            ? CalendarClock
            : isAssignAccepted
              ? UserCheck
              : isAssignDeclined
                ? UserX
                : isAssignReturned
                  ? Undo2
                  : MessageSquare;

  const title = isMention
    ? 'Você foi mencionado'
    : isAssigned
      ? 'Nova atividade atribuída a você'
      : isReminder
        ? 'Lembrete de tarefa'
        : isInvite
          ? 'Convite para reunião'
          : isAccepted
            ? `${n.payload?.invitee_name || 'Convidado'} aceitou`
            : isDeclined
              ? `${n.payload?.invitee_name || 'Convidado'} recusou`
              : isProposed
                ? `${n.payload?.invitee_name || 'Convidado'} propôs novo horário`
                : isAssignAccepted
                  ? `${n.payload?.responder_name || 'Responsável'} aceitou a tarefa`
                  : isAssignDeclined
                    ? `${n.payload?.responder_name || 'Responsável'} rejeitou a tarefa`
                    : isAssignReturned
                      ? `${n.payload?.responder_name || 'Responsável'} devolveu a tarefa`
                      : 'Notificação';

  const body = n.payload?.snippet || n.payload?.task_title || '';

  const respond = async (status: 'accepted' | 'declined') => {
    if (!n.payload?.invitation_id) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('meeting_invitations')
        .update({ status, proposed_date: null, proposed_time: null, proposed_message: null } as any)
        .eq('id', n.payload.invitation_id);
      if (error) throw error;
      toast.success(status === 'accepted' ? 'Convite aceito' : 'Convite recusado');
    } catch (e: any) {
      toast.error('Falha ao responder', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const sendProposal = async () => {
    if (!n.payload?.invitation_id) return;
    if (!propDate || !propTime) {
      toast.error('Informe data e horário');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('meeting_invitations')
        .update({
          status: 'proposed',
          proposed_date: propDate,
          proposed_time: propTime,
          proposed_message: propMsg || null,
        } as any)
        .eq('id', n.payload.invitation_id);
      if (error) throw error;
      toast.success('Nova proposta enviada ao organizador');
      setProposeOpen(false);
    } catch (e: any) {
      toast.error('Falha ao propor horário', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  // Organizador respondendo a uma proposta de novo horário
  const handleProposal = async (accept: boolean) => {
    if (!n.payload?.invitation_id || !n.payload?.task_id) return;
    setBusy(true);
    try {
      if (accept) {
        // Atualiza horário da reunião
        const updates: any = {};
        if (n.payload.proposed_date) updates.due_date = n.payload.proposed_date;
        if (n.payload.proposed_time) updates.due_time = n.payload.proposed_time;
        if (Object.keys(updates).length > 0) {
          const { error: tErr } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', n.payload.task_id);
          if (tErr) throw tErr;
        }
        const { error } = await supabase
          .from('meeting_invitations')
          .update({
            status: 'accepted',
            proposed_date: null,
            proposed_time: null,
            proposed_message: null,
          } as any)
          .eq('id', n.payload.invitation_id);
        if (error) throw error;
        toast.success('Novo horário aceito — reunião atualizada');
      } else {
        // Rejeita a proposta — volta a pendente
        const { error } = await supabase
          .from('meeting_invitations')
          .update({
            status: 'pending',
            proposed_date: null,
            proposed_time: null,
            proposed_message: null,
          } as any)
          .eq('id', n.payload.invitation_id);
        if (error) throw error;
        toast.success('Proposta rejeitada');
      }
    } catch (e: any) {
      toast.error('Falha', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  // Responder a uma atribuição de tarefa (aceitar / rejeitar / devolver)
  const respondAssignment = async (status: 'accepted' | 'declined' | 'returned') => {
    if (!n.payload?.task_id || !user) return;
    if ((status === 'declined' || status === 'returned') && !reason.trim()) {
      toast.error('Informe o motivo');
      return;
    }
    setBusy(true);
    try {
      // Descobre quem atribuiu (para devolver)
      let assigner: string | undefined;
      if (status === 'returned') {
        const { data: row } = await supabase
          .from('task_assignees')
          .select('assigned_by')
          .eq('task_id', n.payload.task_id)
          .eq('user_id', user.id)
          .maybeSingle();
        assigner = (row as any)?.assigned_by as string | undefined;
      }

      const { error } = await supabase
        .from('task_assignees')
        .update({
          assignment_status: status,
          response_reason: status === 'accepted' ? null : reason.trim(),
        } as any)
        .eq('task_id', n.payload.task_id)
        .eq('user_id', user.id);
      if (error) throw error;

      if (status === 'returned' && assigner && assigner !== user.id) {
        await supabase
          .from('task_assignees')
          .upsert(
            {
              task_id: n.payload.task_id,
              user_id: assigner,
              assigned_by: user.id,
              assignment_status: 'pending',
            } as any,
            { onConflict: 'task_id,user_id' }
          );
      }

      if (status === 'declined' || status === 'returned') {
        await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', n.payload.task_id)
          .eq('user_id', user.id);
      }
      toast.success(
        status === 'accepted'
          ? 'Tarefa aceita'
          : status === 'declined'
            ? 'Tarefa rejeitada'
            : 'Tarefa devolvida ao remetente'
      );
      setReasonMode(null);
      setReason('');
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
          {isProposed && n.payload?.proposed_date && (
            <div className="text-[11px] text-primary mt-0.5">
              Proposta: {format(parseISO(`${n.payload.proposed_date}T${n.payload.proposed_time || '00:00'}`), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
            </div>
          )}
          {isProposed && n.payload?.proposed_message && (
            <div className="text-[11px] text-muted-foreground mt-0.5 italic">
              "{n.payload.proposed_message}"
            </div>
          )}
        </div>
        {!n.readAt && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
      </button>

      {isInvite && !proposeOpen && (
        <div className="flex flex-wrap gap-1.5 pl-9">
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
            variant="secondary"
            disabled={busy}
            onClick={() => setProposeOpen(true)}
            className="h-7 text-xs gap-1"
          >
            <CalendarClock className="h-3 w-3" />
            Propor novo horário
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

      {isInvite && proposeOpen && (
        <div className="pl-9 space-y-1.5">
          <div className="flex gap-1.5">
            <Input
              type="date"
              value={propDate}
              onChange={(e) => setPropDate(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              type="time"
              value={propTime}
              onChange={(e) => setPropTime(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <Input
            placeholder="Mensagem (opcional)"
            value={propMsg}
            onChange={(e) => setPropMsg(e.target.value)}
            className="h-7 text-xs"
          />
          <div className="flex gap-1.5">
            <Button size="sm" disabled={busy} onClick={sendProposal} className="h-7 text-xs gap-1">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Enviar proposta
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setProposeOpen(false)}
              className="h-7 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {isProposed && (
        <div className="flex gap-1.5 pl-9">
          <Button
            size="sm"
            variant="default"
            disabled={busy}
            onClick={() => handleProposal(true)}
            className="h-7 text-xs gap-1"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Aceitar novo horário
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => handleProposal(false)}
            className="h-7 text-xs gap-1"
          >
            <X className="h-3 w-3" />
            Rejeitar
          </Button>
        </div>
      )}

      {isAssigned && !reasonMode && (
        <div className="flex flex-wrap gap-1.5 pl-9">
          <Button
            size="sm"
            variant="default"
            disabled={busy}
            onClick={() => respondAssignment('accepted')}
            className="h-7 text-xs gap-1"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Aceitar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setReasonMode('returned')}
            className="h-7 text-xs gap-1"
          >
            <Undo2 className="h-3 w-3" />
            Devolver
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setReasonMode('declined')}
            className="h-7 text-xs gap-1"
          >
            <X className="h-3 w-3" />
            Rejeitar
          </Button>
        </div>
      )}

      {isAssigned && reasonMode && (
        <div className="pl-9 space-y-1.5">
          <Textarea
            placeholder={
              reasonMode === 'declined'
                ? 'Motivo da rejeição (obrigatório)'
                : 'Motivo da devolução (obrigatório)'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[60px] text-xs"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={busy || !reason.trim()}
              onClick={() => respondAssignment(reasonMode)}
              className="h-7 text-xs gap-1"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setReasonMode(null);
                setReason('');
              }}
              className="h-7 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {(isAssignDeclined || isAssignReturned) && n.payload?.reason && (
        <div className="pl-9 text-[11px] text-muted-foreground italic">
          Motivo: "{n.payload.reason}"
        </div>
      )}
    </div>
  );
}

