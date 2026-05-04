import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, Trash2, Loader2, Pencil } from 'lucide-react';

export default function MembersPage() {
  const { user } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);
  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const loadingMembers = useWorkspaceStore((s) => s.loadingMembers);
  const canManageCurrent = useWorkspaceStore((s) => s.canManageCurrent);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', display_name: '', role: 'member' });
  const [lookup, setLookup] = useState<{
    state: 'idle' | 'searching' | 'new' | 'existing' | 'already_member';
    user_id?: string;
    display_name?: string | null;
    current_role?: string | null;
  }>({ state: 'idle' });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<{ userId: string; displayName: string; email: string } | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', email: '', password: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (currentWorkspaceId && membersWorkspaceId !== currentWorkspaceId) {
      fetchMembers(currentWorkspaceId);
    }
  }, [currentWorkspaceId, membersWorkspaceId, fetchMembers]);

  const ws = workspaces.find((w) => w.id === currentWorkspaceId);
  const isAdmin = canManageCurrent(user?.id);
  const showSkeleton = loadingMembers || membersWorkspaceId !== currentWorkspaceId;
  const visibleMembers = membersWorkspaceId === currentWorkspaceId ? members : [];

  const callAdminFn = async (body: Record<string, any>) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error('Sem sessão');
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-members`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Erro');
    return json;
  };

  // Debounced email lookup: detecta se já existe usuário com esse e-mail.
  useEffect(() => {
    if (!open || !currentWorkspaceId) return;
    const email = form.email.trim();
    if (!email || !/.+@.+\..+/.test(email)) {
      setLookup({ state: 'idle' });
      return;
    }
    setLookup({ state: 'searching' });
    const t = setTimeout(async () => {
      try {
        const data = await callAdminFn({ action: 'lookup_email', workspace_id: currentWorkspaceId, email });
        if (!data.exists) {
          setLookup({ state: 'new' });
        } else if (data.already_member) {
          setLookup({
            state: 'already_member',
            user_id: data.user_id,
            display_name: data.display_name,
            current_role: data.current_role,
          });
        } else {
          setLookup({
            state: 'existing',
            user_id: data.user_id,
            display_name: data.display_name,
          });
          if (data.display_name) {
            setForm((f) => (f.display_name ? f : { ...f, display_name: data.display_name }));
          }
        }
      } catch {
        setLookup({ state: 'idle' });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.email, open, currentWorkspaceId]);

  const handleCreate = async () => {
    if (!currentWorkspaceId) return;
    if (!form.email) {
      toast.error('Informe o e-mail');
      return;
    }
    setSubmitting(true);
    try {
      if (lookup.state === 'existing' && lookup.user_id) {
        await callAdminFn({
          action: 'add_existing',
          workspace_id: currentWorkspaceId,
          user_id: lookup.user_id,
          role: form.role,
        });
        toast.success('Pessoa vinculada ao workspace');
      } else if (lookup.state === 'already_member') {
        toast.error('Essa pessoa já é membro do workspace');
        return;
      } else {
        if (!form.password) {
          toast.error('Defina uma senha inicial');
          return;
        }
        await callAdminFn({ action: 'create', workspace_id: currentWorkspaceId, ...form });
        toast.success('Membro adicionado');
      }
      setOpen(false);
      setForm({ email: '', password: '', display_name: '', role: 'member' });
      setLookup({ state: 'idle' });
      fetchMembers(currentWorkspaceId);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    if (!currentWorkspaceId) return;
    try {
      await callAdminFn({ action: 'update_role', workspace_id: currentWorkspaceId, user_id: userId, role });
      toast.success('Papel atualizado');
      fetchMembers(currentWorkspaceId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!currentWorkspaceId) return;
    if (!confirm('Remover este membro do workspace?')) return;
    try {
      await callAdminFn({ action: 'remove', workspace_id: currentWorkspaceId, user_id: userId });
      toast.success('Membro removido');
      fetchMembers(currentWorkspaceId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openEdit = async (m: { userId: string; displayName: string | null }) => {
    setEditing({ userId: m.userId, displayName: m.displayName || '', email: '' });
    setEditForm({ display_name: m.displayName || '', email: '', password: '' });
    setEditOpen(true);
    setEditLoading(true);
    try {
      const data = await callAdminFn({
        action: 'get_member',
        workspace_id: currentWorkspaceId,
        user_id: m.userId,
      });
      setEditing({
        userId: m.userId,
        displayName: data.display_name || m.displayName || '',
        email: data.email || '',
      });
      setEditForm({
        display_name: data.display_name || m.displayName || '',
        email: data.email || '',
        password: '',
      });
    } catch (e: any) {
      toast.error('Não foi possível carregar dados do membro');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!currentWorkspaceId || !editing) return;
    const payload: Record<string, any> = {
      action: 'update_member',
      workspace_id: currentWorkspaceId,
      user_id: editing.userId,
    };
    if (editForm.display_name.trim() && editForm.display_name.trim() !== editing.displayName) {
      payload.display_name = editForm.display_name.trim();
    }
    if (editForm.email.trim() && editForm.email.trim() !== editing.email) {
      payload.email = editForm.email.trim();
    }
    if (editForm.password) {
      if (editForm.password.length < 8) {
        toast.error('Senha precisa ter pelo menos 8 caracteres');
        return;
      }
      payload.password = editForm.password;
    }
    if (!payload.display_name && !payload.email && !payload.password) {
      toast.error('Nada para alterar');
      return;
    }
    setEditSubmitting(true);
    try {
      await callAdminFn(payload);
      toast.success('Membro atualizado');
      setEditOpen(false);
      setEditing(null);
      fetchMembers(currentWorkspaceId);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Membros</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie quem tem acesso ao workspace.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={currentWorkspaceId ?? ''} onValueChange={setCurrentWorkspace}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} {w.isPersonal && '(pessoal)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isAdmin && !ws?.isPersonal && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Adicionar membro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar pessoa</DialogTitle>
                  <DialogDescription>
                    Digite o e-mail. Se a pessoa já tiver conta, ela será apenas vinculada ao workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                    {lookup.state === 'searching' && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Procurando…
                      </p>
                    )}
                    {lookup.state === 'existing' && (
                      <p className="text-xs text-primary mt-1">
                        Conta encontrada{lookup.display_name ? ` — ${lookup.display_name}` : ''}. Será apenas vinculada (sem nova senha).
                      </p>
                    )}
                    {lookup.state === 'already_member' && (
                      <p className="text-xs text-destructive mt-1">
                        Esta pessoa já é membro deste workspace ({lookup.current_role}).
                      </p>
                    )}
                    {lookup.state === 'new' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Nenhuma conta encontrada. Vamos criar uma nova.
                      </p>
                    )}
                  </div>
                  {lookup.state !== 'existing' && lookup.state !== 'already_member' && (
                    <>
                      <div>
                        <Label>Nome</Label>
                        <Input
                          value={form.display_name}
                          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Senha inicial (mín. 8 caracteres)</Label>
                        <Input
                          type="text"
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Papel</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Membro</SelectItem>
                        <SelectItem value="guest">Convidado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={submitting || lookup.state === 'searching' || lookup.state === 'already_member'}
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {lookup.state === 'existing' ? 'Vincular' : 'Criar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="border border-border rounded-lg divide-y divide-border bg-card">
        {showSkeleton && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="h-9 w-9 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-muted rounded" />
                  <div className="h-2 w-20 bg-muted rounded" />
                </div>
                <div className="h-6 w-16 bg-muted rounded" />
              </div>
            ))}
          </>
        )}
        {!showSkeleton && visibleMembers.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum membro.</div>
        )}
        {!showSkeleton && visibleMembers.map((m) => {
          const isMe = m.userId === user?.id;
          const isWsOwner = m.role === 'owner';
          return (
            <div key={m.userId} className="flex items-center gap-3 p-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={m.avatarUrl ?? undefined} />
                <AvatarFallback>
                  {(m.displayName || '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {m.displayName || m.userId.slice(0, 8)}
                  {isMe && <Badge variant="secondary" className="ml-2 text-[10px]">você</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Entrou em {new Date(m.joinedAt).toLocaleDateString('pt-BR')}
                </div>
              </div>

              {isAdmin && !ws?.isPersonal && !isMe && !isWsOwner ? (
                <Select value={m.role} onValueChange={(v) => handleRoleChange(m.userId, v)}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Membro</SelectItem>
                    <SelectItem value="guest">Convidado</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="capitalize">{m.role}</Badge>
              )}

              {isAdmin && !ws?.isPersonal && !isWsOwner && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(m)}
                  title="Editar membro"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}

              {isAdmin && !ws?.isPersonal && !isMe && !isWsOwner && (
                <Button variant="ghost" size="icon" onClick={() => handleRemove(m.userId)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar membro</DialogTitle>
            <DialogDescription>
              Os campos abaixo já mostram os dados atuais. Edite o que precisar e deixe a senha em branco para mantê-la.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={editForm.display_name}
                disabled={editLoading}
                placeholder={editLoading ? 'Carregando...' : ''}
                onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                disabled={editLoading}
                placeholder={editLoading ? 'Carregando...' : 'email@exemplo.com'}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
              {editing?.email && !editLoading && (
                <p className="text-xs text-muted-foreground mt-1">
                  Atual: {editing.email}
                </p>
              )}
            </div>
            <div>
              <Label>Nova senha (opcional, mín. 8)</Label>
              <Input
                type="text"
                placeholder="Deixe em branco para manter a atual"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={editSubmitting}>
              {editSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
