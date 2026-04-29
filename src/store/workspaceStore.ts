import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  isPersonal: boolean;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  members: WorkspaceMember[];
  loading: boolean;
  fetchWorkspaces: () => Promise<void>;
  setCurrentWorkspace: (id: string) => void;
  fetchMembers: (workspaceId: string) => Promise<void>;
  currentRole: () => WorkspaceRole | null;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspaceId: null,
  members: [],
  loading: false,

  fetchWorkspaces: async () => {
    set({ loading: true });
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      set({ loading: false });
      return;
    }

    const { data: memberRows } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId);

    const ids = (memberRows || []).map((m) => m.workspace_id);
    if (ids.length === 0) {
      set({ workspaces: [], loading: false });
      return;
    }

    const { data: wsRows } = await supabase
      .from('workspaces')
      .select('id, name, slug, owner_id, is_personal')
      .in('id', ids)
      .order('is_personal', { ascending: false })
      .order('name');

    const workspaces: Workspace[] = (wsRows || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      ownerId: w.owner_id,
      isPersonal: !!w.is_personal,
    }));

    // Default to first non-personal (shared) workspace if any, else personal
    const current =
      get().currentWorkspaceId ||
      workspaces.find((w) => !w.isPersonal)?.id ||
      workspaces[0]?.id ||
      null;

    set({ workspaces, currentWorkspaceId: current, loading: false });
  },

  setCurrentWorkspace: (id) => set({ currentWorkspaceId: id, members: [] }),

  fetchMembers: async (workspaceId) => {
    const { data: rows } = await supabase
      .from('workspace_members')
      .select('workspace_id, user_id, role, joined_at')
      .eq('workspace_id', workspaceId);

    const userIds = (rows || []).map((r) => r.user_id);
    let profiles: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profRows } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);
      profiles = Object.fromEntries(
        (profRows || []).map((p: any) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }])
      );
    }

    const members: WorkspaceMember[] = (rows || []).map((r: any) => ({
      workspaceId: r.workspace_id,
      userId: r.user_id,
      role: r.role,
      joinedAt: r.joined_at,
      displayName: profiles[r.user_id]?.display_name ?? null,
      avatarUrl: profiles[r.user_id]?.avatar_url ?? null,
      email: null,
    }));

    set({ members });
  },

  currentRole: () => {
    const { workspaces, currentWorkspaceId, members } = get();
    if (!currentWorkspaceId) return null;
    const ws = workspaces.find((w) => w.id === currentWorkspaceId);
    if (!ws) return null;
    // Quick path for personal workspace
    if (ws.isPersonal) return 'owner';
    const m = members.find((x) => x.workspaceId === currentWorkspaceId);
    return m?.role ?? null;
  },
}));
