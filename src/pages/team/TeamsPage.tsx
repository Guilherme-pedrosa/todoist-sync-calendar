import { useEffect, useState } from 'react';
import { userDisplayName } from '@/lib/userDisplay';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Team {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

export default function TeamsPage() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);
  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);

  const [teams, setTeams] = useState<Team[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [memberDialog, setMemberDialog] = useState<Team | null>(null);
  const [teamMemberIds, setTeamMemberIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentWorkspaceId) {
      if (membersWorkspaceId !== currentWorkspaceId) fetchMembers(currentWorkspaceId);
      loadTeams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId, membersWorkspaceId]);

  const visibleMembers = membersWorkspaceId === currentWorkspaceId ? members : [];

  const loadTeams = async () => {
    if (!currentWorkspaceId) return;
    const { data: tRows } = await supabase
      .from('teams')
      .select('id, name, description')
      .eq('workspace_id', currentWorkspaceId);
    const tIds = (tRows || []).map((t) => t.id);
    let counts: Record<string, number> = {};
    if (tIds.length > 0) {
      const { data: tmRows } = await supabase
        .from('team_members')
        .select('team_id')
        .in('team_id', tIds);
      counts = (tmRows || []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.team_id] = (acc[r.team_id] || 0) + 1;
        return acc;
      }, {});
    }
    setTeams(
      (tRows || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        memberCount: counts[t.id] || 0,
      }))
    );
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '' });
    setOpen(true);
  };

  const openEdit = (t: Team) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description ?? '' });
    setOpen(true);
  };

  const save = async () => {
    if (!currentWorkspaceId || !form.name.trim()) return;
    if (editing) {
      const { error } = await supabase
        .from('teams')
        .update({ name: form.name, description: form.description || null })
        .eq('id', editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('teams').insert({
        workspace_id: currentWorkspaceId,
        name: form.name,
        description: form.description || null,
      });
      if (error) return toast.error(error.message);
    }
    setOpen(false);
    loadTeams();
  };

  const remove = async (t: Team) => {
    if (!confirm(`Excluir time "${t.name}"?`)) return;
    const { error } = await supabase.from('teams').delete().eq('id', t.id);
    if (error) return toast.error(error.message);
    toast.success('Time excluído');
    loadTeams();
  };

  const openMembers = async (t: Team) => {
    setMemberDialog(t);
    const { data } = await supabase.from('team_members').select('user_id').eq('team_id', t.id);
    setTeamMemberIds(new Set((data || []).map((r: any) => r.user_id)));
  };

  const toggleMember = async (userId: string, checked: boolean) => {
    if (!memberDialog) return;
    if (checked) {
      const { error } = await supabase
        .from('team_members')
        .upsert({ team_id: memberDialog.id, user_id: userId, role: 'member' });
      if (error) return toast.error(error.message);
      setTeamMemberIds((s) => new Set([...s, userId]));
    } else {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', memberDialog.id)
        .eq('user_id', userId);
      if (error) return toast.error(error.message);
      setTeamMemberIds((s) => {
        const n = new Set(s);
        n.delete(userId);
        return n;
      });
    }
    loadTeams();
  };

  const ws = workspaces.find((w) => w.id === currentWorkspaceId);
  const isPersonal = ws?.isPersonal;

  return (
    <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Times</h1>
          <p className="text-sm text-muted-foreground mt-1">Sub-grupos dentro do workspace.</p>
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
          {!isPersonal && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Novo time
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12">
            Nenhum time ainda.
          </div>
        )}
        {teams.map((t) => (
          <div key={t.id} className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium">{t.name}</h3>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                  ✎
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(t)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            {t.description && <p className="text-xs text-muted-foreground mb-3">{t.description}</p>}
            <Button variant="outline" size="sm" onClick={() => openMembers(t)} className="w-full">
              <Users className="h-3.5 w-3.5 mr-2" />
              {t.memberCount} {t.memberCount === 1 ? 'membro' : 'membros'}
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar time' : 'Novo time'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Nome do time"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="Descrição (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!memberDialog} onOpenChange={(o) => !o && setMemberDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Membros do time {memberDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {visibleMembers.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-3 p-2 hover:bg-accent rounded-md cursor-pointer"
              >
                <Checkbox
                  checked={teamMemberIds.has(m.userId)}
                  onCheckedChange={(c) => toggleMember(m.userId, !!c)}
                />
                <Avatar className="h-7 w-7">
                  <AvatarImage src={m.avatarUrl ?? undefined} />
                  <AvatarFallback>{(m.displayName || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{userDisplayName(m.displayName, (m as any).email)}</span>
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
