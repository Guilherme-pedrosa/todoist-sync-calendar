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
  /** Workspace id que `members` representa atualmente (null = não carregado / inválido). */
  membersWorkspaceId: string | null;
  loading: boolean;
  loadingMembers: boolean;
  /** Token incremental para descartar respostas antigas em caso de troca rápida de workspace. */
  _fetchMembersToken: number;
  fetchWorkspaces: () => Promise<void>;
  setCurrentWorkspace: (id: string) => void;
  fetchMembers: (workspaceId: string) => Promise<void>;
  currentRole: () => WorkspaceRole | null;
  /** True se o usuário tem permissão de gerir o workspace atual (owner|admin) — funciona mesmo enquanto members ainda carrega. */
  canManageCurrent: (userId: string | undefined | null) => boolean;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspaceId: null,
  members: [],
  membersWorkspaceId: null,
  loading: false,
  loadingMembers: false,
  _fetchMembersToken: 0,

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

    // Default: workspace compartilhado primeiro, senão pessoal.
    const current =
      get().currentWorkspaceId ||
      workspaces.find((w) => !w.isPersonal)?.id ||
      workspaces[0]?.id ||
      null;

    set({ workspaces, currentWorkspaceId: current, loading: false });

    // Pré-carrega members do workspace atual no boot.
    if (current) {
      void get().fetchMembers(current);
    }
  },

  setCurrentWorkspace: (id) => {
    if (get().currentWorkspaceId === id) return;
    // NÃO zera `members` — mantém o anterior visível até a nova lista chegar,
    // mas invalida `membersWorkspaceId` para o consumidor saber que precisa esperar.
    set({ currentWorkspaceId: id, membersWorkspaceId: null });
    void get().fetchMembers(id);
  },

  fetchMembers: async (workspaceId) => {
    const token = get()._fetchMembersToken + 1;
    set({ loadingMembers: true, _fetchMembersToken: token });

    const { data: rows, error } = await supabase
      .from('workspace_members')
      .select('workspace_id, user_id, role, joined_at')
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error('[workspaceStore] fetchMembers error', error);
    }

    const userIds = (rows || []).map((r) => r.user_id);
    let profiles: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profRows } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);
      profiles = Object.fromEntries(
        (profRows || []).map((p: any) => [
          p.user_id,
          { display_name: p.display_name, avatar_url: p.avatar_url },
        ])
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

    // Descarta resposta se outro fetch foi iniciado depois (anti-corrida).
    if (get()._fetchMembersToken !== token) return;

    set({
      members,
      membersWorkspaceId: workspaceId,
      loadingMembers: false,
    });
  },

  currentRole: () => {
    const { workspaces, currentWorkspaceId, members, membersWorkspaceId } = get();
    if (!currentWorkspaceId) return null;
    const ws = workspaces.find((w) => w.id === currentWorkspaceId);
    if (!ws) return null;
    if (ws.isPersonal) return 'owner';
    // Se members ainda não bate com o workspace atual, não há resposta confiável.
    if (membersWorkspaceId !== currentWorkspaceId) return null;
    return members.find((x) => x.workspaceId === currentWorkspaceId)?.role ?? null;
  },

  canManageCurrent: (userId) => {
    if (!userId) return false;
    const { workspaces, currentWorkspaceId, members, membersWorkspaceId } = get();
    if (!currentWorkspaceId) return false;
    const ws = workspaces.find((w) => w.id === currentWorkspaceId);
    if (!ws) return false;
    // Owner conhecido pelo workspace — funciona mesmo antes de members carregar.
    if (ws.ownerId === userId) return true;
    // Caso contrário precisa do members carregado.
    if (membersWorkspaceId !== currentWorkspaceId) return false;
    const me = members.find((m) => m.userId === userId);
    return me?.role === 'owner' || me?.role === 'admin';
  },
}));
