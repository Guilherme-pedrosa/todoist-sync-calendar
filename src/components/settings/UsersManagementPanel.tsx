import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, RefreshCw, KeyRound, UserCog, Trash2, Shield, Activity, Users as UsersIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WorkspaceLite {
  workspace_id: string;
  role: string;
  name: string;
  is_personal: boolean;
}
interface TodayStats {
  online_seconds: number;
  active_seconds: number;
  idle_seconds: number;
  tasks_completed: number;
  tasks_completed_inbox: number;
  tasks_completed_with_project: number;
  activity_score: number;
  last_seen_at: string | null;
}
interface AdminUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  email_confirmed_at: string | null;
  workspaces: WorkspaceLite[];
  today: TodayStats | null;
}

function fmtSeconds(s: number) {
  if (!s) return '0min';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function UsersManagementPanel() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // gate by productivity_admins
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAllowed(false); return; }
      const { data } = await supabase
        .from('productivity_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      setAllowed(!!data);
    })();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list' },
      });
      if (!active) return;
      if (error) {
        toast.error(error.message || 'Falha ao carregar usuários');
        setUsers([]);
      } else {
        setUsers((data as any)?.users || []);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [allowed, refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q) ||
      u.workspaces.some((w) => w.name.toLowerCase().includes(q)),
    );
  }, [users, query]);

  if (allowed === null) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!allowed) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">Acesso restrito</p>
        <p className="text-sm text-muted-foreground mt-1">
          Apenas administradores de produtividade podem gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail ou workspace..."
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <UsersIcon className="h-3.5 w-3.5" />
        {loading ? 'Carregando...' : `${filtered.length} usuário(s)`}
      </div>

      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <UserRow
              key={u.user_id}
              u={u}
              onEdit={() => setEditing(u)}
              onReset={() => setResetting(u)}
            />
          ))}
          {filtered.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado.</div>
          )}
        </div>
      )}

      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setRefreshKey((k) => k + 1); }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
        />
      )}
    </div>
  );
}

function UserRow({ u, onEdit, onReset }: { u: AdminUser; onEdit: () => void; onReset: () => void }) {
  const initials = (u.display_name || u.email || '?').slice(0, 2).toUpperCase();
  const isOnlineToday = !!u.today && u.today.online_seconds > 0;
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10">
          {u.avatar_url && <AvatarImage src={u.avatar_url} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{u.display_name || u.email}</span>
            {isOnlineToday && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Ativo hoje
              </Badge>
            )}
            {!u.email_confirmed_at && (
              <Badge variant="outline" className="text-[10px]">e-mail não confirmado</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Criado em {fmtDate(u.created_at)} · Último login {fmtDate(u.last_sign_in_at)}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <UserCog className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={onReset}>
            <KeyRound className="h-3.5 w-3.5 mr-1" /> Senha
          </Button>
        </div>
      </div>

      {/* Workspaces */}
      {u.workspaces.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {u.workspaces.map((w) => (
            <Badge
              key={w.workspace_id}
              variant={w.role === 'owner' ? 'default' : 'secondary'}
              className="text-[10px]"
              title={w.is_personal ? 'Workspace pessoal' : ''}
            >
              {w.name} · {w.role}
            </Badge>
          ))}
        </div>
      )}

      {/* Today stats */}
      {u.today ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat label="Online hoje" value={fmtSeconds(u.today.online_seconds)} />
          <Stat label="Ativo" value={fmtSeconds(u.today.active_seconds)} />
          <Stat label="Idle" value={fmtSeconds(u.today.idle_seconds)} />
          <Stat
            label="Concluídas"
            value={`${u.today.tasks_completed} (${u.today.tasks_completed_with_project} proj)`}
          />
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Activity className="h-3 w-3" /> Sem atividade registrada hoje
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function EditUserDialog({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const patch: any = { action: 'update_profile', user_id: user.user_id };
    if (displayName !== (user.display_name || '')) patch.display_name = displayName;
    if (email && email !== (user.email || '')) patch.email = email;
    const { error } = await supabase.functions.invoke('admin-users', { body: patch });
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Falha ao salvar');
      return;
    }
    toast.success('Usuário atualizado');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>Atualize nome de exibição e e-mail.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      toast.error('Senha deve ter no mínimo 8 caracteres');
      return;
    }
    setSaving(true);
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'reset_password', user_id: user.user_id, password },
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Falha ao redefinir senha');
      return;
    }
    toast.success('Senha redefinida');
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha para <b>{user.display_name || user.email}</b>. Mínimo 8 caracteres.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nova senha</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Redefinir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
