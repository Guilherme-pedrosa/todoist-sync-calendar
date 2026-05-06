import { useEffect, useMemo, useState } from 'react';
import { userDisplayName } from '@/lib/userDisplay';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { Loader2, Trash2, UserPlus, Users, Globe, Shield } from 'lucide-react';

type ProjectRole = 'admin' | 'editor' | 'commenter' | 'viewer';
type Visibility = 'private' | 'team' | 'workspace';

interface ProjectMemberRow {
  user_id: string;
  role: ProjectRole;
  display_name: string | null;
  avatar_url: string | null;
}
interface TeamRow {
  id: string;
  name: string;
}
interface ProjectTeamRow {
  team_id: string;
  default_role: ProjectRole;
  team_name: string;
  member_count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  workspaceId: string;
  visibility: Visibility;
  ownerId?: string | null;
  isPersonalWorkspace: boolean;
  onVisibilityChange?: (v: Visibility) => void;
}

const ROLE_LABEL: Record<ProjectRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  commenter: 'Comentarista',
  viewer: 'Leitor',
};

export function ProjectAccessDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
  visibility,
  ownerId,
  isPersonalWorkspace,
  onVisibilityChange,
}: Props) {
  const wsMembers = useWorkspaceStore((s) => s.members);
  const wsMembersId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const fetchWsMembers = useWorkspaceStore((s) => s.fetchMembers);

  const [tab, setTab] = useState('members');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [linkedTeams, setLinkedTeams] = useState<ProjectTeamRow[]>([]);
  const [vis, setVis] = useState<Visibility>(visibility);

  const [addUserId, setAddUserId] = useState('');
  const [addUserRole, setAddUserRole] = useState<ProjectRole>('editor');
  const [addTeamId, setAddTeamId] = useState('');
  const [addTeamRole, setAddTeamRole] = useState<ProjectRole>('editor');

  useEffect(() => setVis(visibility), [visibility]);

  // Garante membros do workspace carregados
  useEffect(() => {
    if (open && workspaceId && wsMembersId !== workspaceId) {
      void fetchWsMembers(workspaceId);
    }
  }, [open, workspaceId, wsMembersId, fetchWsMembers]);

  const loadAll = async () => {
    if (!open || !projectId) return;
    setLoading(true);
    try {
      // members
      const { data: pm } = await supabase
        .from('project_members')
        .select('user_id, role')
        .eq('project_id', projectId);

      const memberIds = (pm || []).map((m) => m.user_id);
      let profiles: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (memberIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', memberIds);
        profiles = Object.fromEntries(
          (profs || []).map((p: any) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]),
        );
      }
      setMembers(
        (pm || []).map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          display_name: profiles[m.user_id]?.display_name ?? null,
          avatar_url: profiles[m.user_id]?.avatar_url ?? null,
        })),
      );

      // teams disponíveis
      const { data: teamRows } = await supabase
        .from('teams')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name');
      setTeams(teamRows || []);

      // teams vinculados ao projeto
      const { data: ptRows } = await supabase
        .from('project_teams')
        .select('team_id, default_role')
        .eq('project_id', projectId);

      const ptIds = (ptRows || []).map((p) => p.team_id);
      let teamCounts: Record<string, number> = {};
      let teamNames: Record<string, string> = {};
      if (ptIds.length) {
        const { data: tInfo } = await supabase
          .from('teams')
          .select('id, name')
          .in('id', ptIds);
        teamNames = Object.fromEntries((tInfo || []).map((t: any) => [t.id, t.name]));

        const { data: tmRows } = await supabase
          .from('team_members')
          .select('team_id')
          .in('team_id', ptIds);
        for (const r of tmRows || []) teamCounts[r.team_id] = (teamCounts[r.team_id] || 0) + 1;
      }
      setLinkedTeams(
        (ptRows || []).map((p: any) => ({
          team_id: p.team_id,
          default_role: p.default_role,
          team_name: teamNames[p.team_id] || '—',
          member_count: teamCounts[p.team_id] || 0,
        })),
      );
    } catch (err) {
      console.error('[ProjectAccessDialog] load error', err);
      toast.error('Falha ao carregar dados de acesso');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const callAdmin = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-members', {
        body: { workspace_id: workspaceId, ...payload },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    } finally {
      setBusy(false);
    }
  };

  // ----- Members handlers -----
  const handleAddMember = async () => {
    if (!addUserId) return toast.warning('Selecione um membro');
    try {
      await callAdmin({
        action: 'project_member_add',
        project_id: projectId,
        user_id: addUserId,
        role: addUserRole,
      });
      toast.success('Membro adicionado');
      setAddUserId('');
      await loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao adicionar');
    }
  };

  const handleChangeRole = async (userId: string, role: ProjectRole) => {
    try {
      await callAdmin({
        action: 'project_member_role',
        project_id: projectId,
        user_id: userId,
        role,
      });
      await loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao atualizar papel');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await callAdmin({
        action: 'project_member_remove',
        project_id: projectId,
        user_id: userId,
      });
      toast.success('Membro removido');
      await loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao remover');
    }
  };

  // ----- Teams handlers -----
  const handleLinkTeam = async () => {
    if (!addTeamId) return toast.warning('Selecione um time');
    try {
      await callAdmin({
        action: 'project_team_link',
        project_id: projectId,
        team_id: addTeamId,
        default_role: addTeamRole,
      });
      toast.success('Time vinculado');
      setAddTeamId('');
      await loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao vincular');
    }
  };

  const handleChangeTeamRole = async (teamId: string, role: ProjectRole) => {
    try {
      await callAdmin({
        action: 'project_team_role',
        project_id: projectId,
        team_id: teamId,
        default_role: role,
      });
      await loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao atualizar');
    }
  };

  const handleUnlinkTeam = async (teamId: string) => {
    try {
      await callAdmin({
        action: 'project_team_unlink',
        project_id: projectId,
        team_id: teamId,
      });
      toast.success('Time desvinculado');
      await loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao desvincular');
    }
  };

  // ----- Visibility -----
  const handleVisibilityChange = async (newVis: Visibility) => {
    setVis(newVis);
    try {
      await callAdmin({
        action: 'project_visibility_set',
        project_id: projectId,
        visibility: newVis,
      });
      toast.success('Visibilidade atualizada');
      onVisibilityChange?.(newVis);
    } catch (e: any) {
      setVis(visibility);
      toast.error(e.message ?? 'Falha ao atualizar');
    }
  };

  // available users: workspace members not yet in project
  const availableUsers = useMemo(() => {
    const taken = new Set(members.map((m) => m.user_id));
    return wsMembers.filter((m) => !taken.has(m.userId));
  }, [members, wsMembers]);

  const availableTeams = useMemo(() => {
    const taken = new Set(linkedTeams.map((t) => t.team_id));
    return teams.filter((t) => !taken.has(t.id));
  }, [teams, linkedTeams]);

  const initials = (name: string | null) =>
    (name || '?')
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Compartilhar e gerir acesso
          </SheetTitle>
          <SheetDescription>
            Defina quem pode ver e editar este projeto.
          </SheetDescription>
        </SheetHeader>

        {isPersonalWorkspace ? (
          <div className="mt-6 rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
            Este projeto está no seu workspace pessoal. Para compartilhar com outros
            usuários, mova-o para um workspace de equipe.
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="mt-6">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="members" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Membros
              </TabsTrigger>
              <TabsTrigger value="teams" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Times
              </TabsTrigger>
              <TabsTrigger value="visibility" className="gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Visibilidade
              </TabsTrigger>
            </TabsList>

            {/* MEMBERS */}
            <TabsContent value="members" className="space-y-4 mt-4">
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Adicionar membro
                </p>
                <div className="flex flex-wrap gap-2">
                  <Select value={addUserId} onValueChange={setAddUserId}>
                    <SelectTrigger className="flex-1 min-w-[180px]">
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          Todos os membros do workspace já participam.
                        </div>
                      ) : (
                        availableUsers.map((u) => (
                          <SelectItem key={u.userId} value={u.userId}>
                            {userDisplayName(u.displayName, (u as any).email)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Select value={addUserRole} onValueChange={(v) => setAddUserRole(v as ProjectRole)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['admin', 'editor', 'commenter', 'viewer'] as ProjectRole[]).map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddMember} disabled={busy || !addUserId}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum membro direto. O acesso pode estar vindo de visibilidade ou times.
                  </div>
                ) : (
                  members.map((m) => {
                    const isOwner = m.user_id === ownerId;
                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center gap-3 rounded-md border p-2.5"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={m.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {initials(m.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {userDisplayName(m.display_name, (m as any).email)}
                          </p>
                          {isOwner && (
                            <Badge variant="secondary" className="text-[10px] mt-0.5">
                              Owner do projeto
                            </Badge>
                          )}
                        </div>
                        <Select
                          value={m.role}
                          onValueChange={(v) => handleChangeRole(m.user_id, v as ProjectRole)}
                          disabled={busy || isOwner}
                        >
                          <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['admin', 'editor', 'commenter', 'viewer'] as ProjectRole[]).map((r) => (
                              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={busy || isOwner}
                          onClick={() => handleRemoveMember(m.user_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* TEAMS */}
            <TabsContent value="teams" className="space-y-4 mt-4">
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vincular time
                </p>
                <div className="flex flex-wrap gap-2">
                  <Select value={addTeamId} onValueChange={setAddTeamId}>
                    <SelectTrigger className="flex-1 min-w-[180px]">
                      <SelectValue placeholder="Selecione um time" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTeams.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          Nenhum time disponível.
                        </div>
                      ) : (
                        availableTeams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Select value={addTeamRole} onValueChange={(v) => setAddTeamRole(v as ProjectRole)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['admin', 'editor', 'commenter', 'viewer'] as ProjectRole[]).map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleLinkTeam} disabled={busy || !addTeamId}>
                    Vincular
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Todos os membros do time herdam o papel padrão automaticamente.
                </p>
              </div>

              <div className="space-y-1">
                {linkedTeams.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum time vinculado.
                  </div>
                ) : (
                  linkedTeams.map((t) => (
                    <div key={t.team_id} className="flex items-center gap-3 rounded-md border p-2.5">
                      <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.team_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.member_count} {t.member_count === 1 ? 'membro' : 'membros'}
                        </p>
                      </div>
                      <Select
                        value={t.default_role}
                        onValueChange={(v) => handleChangeTeamRole(t.team_id, v as ProjectRole)}
                        disabled={busy}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['admin', 'editor', 'commenter', 'viewer'] as ProjectRole[]).map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => handleUnlinkTeam(t.team_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* VISIBILITY */}
            <TabsContent value="visibility" className="space-y-3 mt-4">
              {(['private', 'team', 'workspace'] as Visibility[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleVisibilityChange(v)}
                  disabled={busy}
                  className={`w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition ${
                    vis === v ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {v === 'private' ? 'Privado' : v === 'team' ? 'Time' : 'Workspace'}
                    </span>
                    {vis === v && (
                      <Badge variant="default" className="text-[10px]">Atual</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {v === 'private' &&
                      'Apenas membros adicionados explicitamente (e times vinculados) têm acesso.'}
                    {v === 'team' &&
                      'Acesso herdado pelo time principal do projeto.'}
                    {v === 'workspace' &&
                      'Todos os membros deste workspace conseguem acessar.'}
                  </p>
                </button>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
