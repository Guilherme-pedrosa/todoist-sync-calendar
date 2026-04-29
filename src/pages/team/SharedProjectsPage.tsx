import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceStore } from '@/store/workspaceStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Lock, Users, Globe } from 'lucide-react';

interface ProjectRow {
  id: string;
  name: string;
  color: string;
  visibility: 'private' | 'team' | 'workspace';
  team_id: string | null;
  owner_id: string;
  memberCount: number;
}

const visibilityIcon = {
  private: Lock,
  team: Users,
  workspace: Globe,
};

export default function SharedProjectsPage() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);
  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'private' | 'team' | 'workspace'>('all');

  useEffect(() => {
    if (currentWorkspaceId) {
      if (membersWorkspaceId !== currentWorkspaceId) fetchMembers(currentWorkspaceId);
      loadProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId, membersWorkspaceId]);

  const loadProjects = async () => {
    if (!currentWorkspaceId) return;
    const { data: pRows } = await supabase
      .from('projects')
      .select('id, name, color, visibility, team_id, owner_id')
      .eq('workspace_id', currentWorkspaceId)
      .order('name');
    const ids = (pRows || []).map((p) => p.id);
    let memberCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: pm } = await supabase
        .from('project_members')
        .select('project_id')
        .in('project_id', ids);
      memberCounts = (pm || []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.project_id] = (acc[r.project_id] || 0) + 1;
        return acc;
      }, {});
    }
    setProjects(
      (pRows || []).map((p: any) => ({
        ...p,
        memberCount: memberCounts[p.id] || 0,
      }))
    );
  };

  const filtered = projects.filter((p) => filter === 'all' || p.visibility === filter);

  return (
    <div className="flex-1 overflow-auto p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Projetos compartilhados</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Projetos visíveis dentro do workspace atual.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="private">Privados</SelectItem>
              <SelectItem value="team">Por time</SelectItem>
              <SelectItem value="workspace">Workspace</SelectItem>
            </SelectContent>
          </Select>
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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12">
            Nenhum projeto.
          </div>
        )}
        {filtered.map((p) => {
          const Icon = visibilityIcon[p.visibility];
          const owner = members.find((m) => m.userId === p.owner_id);
          return (
            <div key={p.id} className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <h3 className="font-medium truncate">{p.name}</h3>
                </div>
                <Badge variant="outline" className="capitalize gap-1">
                  <Icon className="h-3 w-3" /> {p.visibility}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {owner && (
                    <>
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={owner.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-[9px]">
                          {(owner.displayName || '?').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{owner.displayName || 'Dono'}</span>
                    </>
                  )}
                </div>
                <span>{p.memberCount} membros diretos</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
