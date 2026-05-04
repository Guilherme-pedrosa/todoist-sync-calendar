import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label as UiLabel } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { CalendarDays, Clock, Users, X, Mail, Loader2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore, type WorkspaceMember } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  defaultTime?: string;
  /** Se informado, converte a tarefa existente em reunião em vez de criar uma nova. */
  convertTaskId?: string;
  /** Pré-preenche o título quando convertendo. */
  defaultTitle?: string;
  /** Pré-preenche a descrição quando convertendo. */
  defaultDescription?: string;
  /** Pré-preenche a duração em minutos quando convertendo. */
  defaultDuration?: number;
  /** Membros já marcados como responsáveis (serão adicionados como convidados). */
  defaultUserInviteeIds?: string[];
}

type Invitee =
  | { kind: 'user'; userId: string; name: string; email: string | null; avatarUrl: string | null }
  | { kind: 'email'; email: string };

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export function ScheduleMeetingDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  convertTaskId,
  defaultTitle,
  defaultDescription,
  defaultDuration,
  defaultUserInviteeIds,
}: Props) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const projects = useTaskStore((s) => s.projects);
  const inboxId = useMemo(() => projects.find((p) => p.isInbox)?.id, [projects]);

  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate || today);
  const [time, setTime] = useState(defaultTime || '10:00');
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState('');
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [search, setSearch] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [addMeet, setAddMeet] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || '');
      setDate(defaultDate || today);
      setTime(defaultTime || '10:00');
      setDuration(defaultDuration || 60);
      setDescription(defaultDescription || '');
      // Pré-popula convidados com responsáveis existentes (excluindo o próprio usuário)
      const seedIds = (defaultUserInviteeIds || []).filter((id) => id && id !== user?.id);
      const seeded: Invitee[] = seedIds
        .map((uid) => members.find((m) => m.userId === uid))
        .filter((m): m is WorkspaceMember => !!m)
        .map((m) => ({
          kind: 'user',
          userId: m.userId,
          name: m.displayName || m.email || 'Membro',
          email: m.email,
          avatarUrl: m.avatarUrl,
        }));
      setInvitees(seeded);
      setSearch('');
      setEmailDraft('');
      setAddMeet(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, defaultTime, defaultTitle, defaultDescription, defaultDuration, today]);

  useEffect(() => {
    if (open && currentWorkspaceId && currentWorkspaceId !== membersWorkspaceId) {
      void fetchMembers(currentWorkspaceId);
    }
  }, [open, currentWorkspaceId, membersWorkspaceId, fetchMembers]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m: WorkspaceMember) => {
      if (m.userId === user?.id) return false;
      if (invitees.some((i) => i.kind === 'user' && i.userId === m.userId)) return false;
      if (!q) return true;
      return (
        (m.displayName || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      );
    });
  }, [members, search, invitees, user?.id]);

  const addUser = (m: WorkspaceMember) => {
    setInvitees((prev) => [
      ...prev,
      { kind: 'user', userId: m.userId, name: m.displayName || m.email || 'Membro', email: m.email, avatarUrl: m.avatarUrl },
    ]);
    setSearch('');
  };

  const addEmail = () => {
    const e = emailDraft.trim().toLowerCase();
    if (!isValidEmail(e)) {
      toast.error('E-mail inválido');
      return;
    }
    if (invitees.some((i) => i.kind === 'email' && i.email === e)) {
      setEmailDraft('');
      return;
    }
    if (invitees.some((i) => i.kind === 'user' && (i.email || '').toLowerCase() === e)) {
      setEmailDraft('');
      return;
    }
    setInvitees((prev) => [...prev, { kind: 'email', email: e }]);
    setEmailDraft('');
  };

  const removeAt = (idx: number) => {
    setInvitees((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Dê um título à reunião');
      return;
    }
    if (!user) return;
    if (!convertTaskId && !inboxId) {
      toast.error('Não foi possível localizar o projeto padrão');
      return;
    }
    if (invitees.length === 0) {
      toast.error('Adicione pelo menos um convidado');
      return;
    }

    setSubmitting(true);
    try {
      let taskId: string;

      if (convertTaskId) {
        // Converte tarefa existente em reunião
        const { data: updated, error: updateError } = await supabase
          .from('tasks')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            due_date: date,
            due_time: time,
            duration_minutes: duration,
            is_meeting: true,
          } as any)
          .eq('id', convertTaskId)
          .select('id, workspace_id')
          .single();
        if (updateError || !updated) {
          throw updateError || new Error('Falha ao converter em reunião');
        }
        taskId = updated.id as string;
      } else {
        // Cria nova tarefa-reunião
        const { data: created, error: insertError } = await supabase
          .from('tasks')
          .insert({
            user_id: user.id,
            created_by: user.id,
            project_id: inboxId!,
            title: title.trim(),
            description: description.trim() || null,
            due_date: date,
            due_time: time,
            duration_minutes: duration,
            priority: 3,
            is_meeting: true,
          } as any)
          .select('id, workspace_id')
          .single();
        if (insertError || !created) {
          throw insertError || new Error('Falha ao criar reunião');
        }
        taskId = created.id as string;
      }

      // 2) Cria os convites
      const rows = invitees.map((i) =>
        i.kind === 'user'
          ? {
              task_id: taskId,
              invitee_user_id: i.userId,
              invitee_email: i.email,
              invitee_name: i.name,
              invited_by: user.id,
            }
          : {
              task_id: taskId,
              invitee_email: i.email,
              invited_by: user.id,
            }
      );

      const { error: inviteError } = await supabase.from('meeting_invitations').insert(rows as any);
      if (inviteError) throw inviteError;

      // 3) Garante o próprio criador como assignee da reunião
      await supabase
        .from('task_assignees' as any)
        .insert({ task_id: taskId, user_id: user.id, assigned_by: user.id })
        .then(() => null, () => null);

      // 4) Adiciona os convidados internos como assignees também
      const internalIds = invitees
        .filter((i): i is Extract<Invitee, { kind: 'user' }> => i.kind === 'user')
        .map((i) => i.userId);
      if (internalIds.length > 0) {
        await supabase
          .from('task_assignees' as any)
          .insert(internalIds.map((uid) => ({ task_id: taskId, user_id: uid, assigned_by: user.id })))
          .then(() => null, () => null);
      }

      // 5) Cria evento no Google Calendar (se conectado)
      try {
        const allEmails = invitees
          .map((i) => (i.kind === 'user' ? i.email : i.email))
          .filter((e): e is string => !!e);

        const endTime = (() => {
          const [h, m] = time.split(':').map(Number);
          const total = h * 60 + m + duration;
          const eh = String(Math.floor((total / 60) % 24)).padStart(2, '0');
          const em = String(total % 60).padStart(2, '0');
          return `${eh}:${em}`;
        })();

        const { data: gcalData, error: gcalError } = await supabase.functions.invoke('google-calendar', {
          body: {
            action: 'create-event',
            taskId,
            title: title.trim(),
            description: description.trim() || undefined,
            date,
            time,
            endTime,
            attendees: allEmails,
            addMeet,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });

        if (!gcalError && gcalData?.id) {
          const meetUrl =
            gcalData.hangoutLink ||
            gcalData.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
            null;
          await supabase
            .from('tasks')
            .update({ gcal_event_id: gcalData.id, meeting_url: meetUrl } as any)
            .eq('id', taskId);
        }
      } catch (e) {
        // GCal pode não estar conectado — segue sem bloquear
        console.warn('[meeting] GCal opcional falhou', e);
      }

      toast.success('Reunião agendada!', {
        description: `${invitees.length} convite(s) enviado(s)`,
      });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[meeting] erro', e);
      toast.error('Falha ao agendar reunião', { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            {convertTaskId ? 'Transformar em reunião' : 'Agendar reunião'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <UiLabel htmlFor="m-title">Título *</UiLabel>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reunião de alinhamento"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <UiLabel htmlFor="m-date" className="text-xs flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Data
              </UiLabel>
              <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <UiLabel htmlFor="m-time" className="text-xs flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Hora
              </UiLabel>
              <Input id="m-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <UiLabel htmlFor="m-dur" className="text-xs">Duração (min)</UiLabel>
              <Input
                id="m-dur"
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Math.max(15, Number(e.target.value) || 60))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <UiLabel htmlFor="m-desc">Descrição</UiLabel>
            <textarea
              id="m-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pauta, objetivos, links..."
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Criar link do Google Meet</div>
                <div className="text-[11px] text-muted-foreground">
                  Adiciona vídeo automaticamente (se você tem GCal conectado)
                </div>
              </div>
            </div>
            <Switch checked={addMeet} onCheckedChange={setAddMeet} />
          </div>

          <div className="space-y-2">
            <UiLabel className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Convidados *
            </UiLabel>

            {invitees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {invitees.map((i, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/30 pl-1 pr-2 py-0.5 text-xs"
                  >
                    {i.kind === 'user' ? (
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={i.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-[10px]">{getInitials(i.name)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <Mail className="h-3.5 w-3.5 ml-0.5" />
                    )}
                    <span>{i.kind === 'user' ? i.name : i.email}</span>
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar membro do TaskFlow..."
                />
                {search.trim() && filteredMembers.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                    {filteredMembers.slice(0, 6).map((m) => (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => addUser(m)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-accent text-left text-sm"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={m.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {getInitials(m.displayName || m.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{m.displayName || m.email}</div>
                          {m.email && (
                            <div className="truncate text-[10px] text-muted-foreground">{m.email}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Input
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  placeholder="ou e-mail externo..."
                  type="email"
                />
                <Button type="button" variant="outline" onClick={addEmail} className="shrink-0">
                  Adicionar
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className={cn('gap-2')}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Agendar e enviar convites
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
