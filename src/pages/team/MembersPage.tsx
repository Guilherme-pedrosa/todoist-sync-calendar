import { useEffect, useState } from 'react';
import { userDisplayName } from '@/lib/userDisplay';
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
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [form, setForm] = useState({ email: '', password: '', display_name: '', role: 'member' });
  const [candidates, setCandidates] = useState<
    { user_id: string; email: string | null; display_name: string | null; avatar_url: string | null }[]
  >([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [pickedUserId, setPickedUserId] = useState<string>('');
  const [pickRole, setPickRole] = useState<string>('member');
  const [pickFilter, setPickFilter] = useState('');

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

  // Quando abrir o diálogo, busca usuários que ainda não pertencem ao workspace.
  useEffect(() => {
    if (!open || !currentWorkspaceId) return;
    setLoadingCandidates(true);
    setPickedUserId('');
    setPickFilter('');
    setMode('pick');
    callAdminFn({ action: 'list_non_members', workspace_id: currentWorkspaceId })
      .then((data) => setCandidates(data.users ?? []))
      .catch(() => setCandidates([]))
      .finally(() => setLoadingCandidates(false));
  }, [open, currentWorkspaceId]);

  const filteredCandidates = candidates.filter((c) => {
    if (!pickFilter.trim()) return true;
    const q = pickFilter.trim().toLowerCase();
    return (
      (c.display_name ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  });

  const handleAddExisting = async () => {
    if (!currentWorkspaceId || !pickedUserId) {
      toast.error('Selecione uma pessoa');
      return;
    }
    setSubmitting(true);
    try {
      await callAdminFn({
        action: 'add_existing',
        workspace_id: currentWorkspaceId,
        user_id: pickedUserId,
        role: pickRole,
      });
      toast.success('Pessoa vinculada ao workspace');
      setOpen(false);
      fetchMembers(currentWorkspaceId);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async () => {
    if (!currentWorkspaceId) return;
    if (!form.email || !form.password) {
      toast.error('Preencha email e senha');
      return;
    }
    setSubmitting(true);
    try {
      await callAdminFn({ action: 'create', workspace_id: currentWorkspaceId, ...form });
      toast.success('Conta criada e vinculada');
      setOpen(false);
      setForm({ email: '', password: '', display_name: '', role: 'member' });
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
                  <div className="flex gap-2 border-b border-border">
                    <button
                      type="button"
                      onClick={() => setMode('pick')}
                      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                        mode === 'pick' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                      }`}
                    >
                      Selecionar pessoa
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('create')}
                      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                        mode === 'create' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                      }`}
                    >
                      Criar nova conta
                    </button>
                  </div>

                  {mode === 'pick' ? (
                    <div className="space-y-3">
                      <Input
                        placeholder="Buscar por nome ou e-mail…"
                        value={pickFilter}
                        onChange={(e) => setPickFilter(e.target.value)}
                      />
                      <div className="max-h-64 overflow-auto border border-border rounded-md divide-y divide-border">
                        {loadingCandidates && (
                          <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
                          </div>
                        )}
                        {!loadingCandidates && filteredCandidates.length === 0 && (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            Ninguém disponível. Use "Criar nova conta".
                          </div>
                        )}
                        {!loadingCandidates &&
                          filteredCandidates.map((c) => {
                            const selected = pickedUserId === c.user_id;
                            return (
                              <button
                                key={c.user_id}
                                type="button"
                                onClick={() => setPickedUserId(c.user_id)}
                                className={`w-full flex items-center gap-3 p-2.5 text-left hover:bg-muted/50 transition ${
                                  selected ? 'bg-primary/10' : ''
                                }`}
                              >
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={c.avatar_url ?? undefined} />
                                  <AvatarFallback>
                                    {(c.display_name || c.email || '?').slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {c.display_name || c.email}
                                  </div>
                                  {c.display_name && (
                                    <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                                  )}
                                </div>
                                {selected && <Badge variant="secondary">Selecionado</Badge>}
                              </button>
                            );
                          })}
                      </div>
                      <div>
                        <Label>Papel</Label>
                        <Select value={pickRole} onValueChange={setPickRole}>
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
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                      </div>
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
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={mode === 'pick' ? handleAddExisting : handleCreate}
                    disabled={submitting || (mode === 'pick' && !pickedUserId)}
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {mode === 'pick' ? 'Vincular' : 'Criar'}
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
                  {userDisplayName(m.displayName, (m as any).email)}
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
