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
import { UserPlus, Trash2, Loader2 } from 'lucide-react';

export default function MembersPage() {
  const { user } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);
  const members = useWorkspaceStore((s) => s.members);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', display_name: '', role: 'member' });

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (currentWorkspaceId) fetchMembers(currentWorkspaceId);
  }, [currentWorkspaceId, fetchMembers]);

  const ws = workspaces.find((w) => w.id === currentWorkspaceId);
  const myMembership = members.find((m) => m.userId === user?.id);
  const isAdmin = myMembership?.role === 'owner' || myMembership?.role === 'admin';

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

  const handleCreate = async () => {
    if (!currentWorkspaceId) return;
    if (!form.email || !form.password) {
      toast.error('Preencha email e senha');
      return;
    }
    setSubmitting(true);
    try {
      await callAdminFn({ action: 'create', workspace_id: currentWorkspaceId, ...form });
      toast.success('Membro adicionado');
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
                  <DialogTitle>Novo membro</DialogTitle>
                  <DialogDescription>
                    Cria a conta diretamente. A pessoa receberá email e senha por outro canal (você).
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
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="border border-border rounded-lg divide-y divide-border bg-card">
        {members.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum membro.</div>
        )}
        {members.map((m) => {
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

              {isAdmin && !ws?.isPersonal && !isMe && !isWsOwner && (
                <Button variant="ghost" size="icon" onClick={() => handleRemove(m.userId)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
