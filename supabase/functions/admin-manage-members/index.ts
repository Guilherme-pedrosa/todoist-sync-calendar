// Edge function: admin-manage-members
// Workspace owners/admins manage: workspace members, teams, team members,
// project members, project↔team links, project visibility.
// All mutations are written to workspace_audit_log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'guest'];
const PROJECT_ROLES = ['admin', 'editor', 'commenter', 'viewer'];
const TEAM_ROLES = ['lead', 'member'];
const VISIBILITIES = ['private', 'team', 'workspace'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Identify caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401);
  const callerId = userData.user.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { action, workspace_id } = body ?? {};
  if (!action || !workspace_id) return json({ error: 'Missing action or workspace_id' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ─── Authorization ─────────────────────────────────────────
  const { data: membership } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', callerId)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return json({ error: 'Forbidden — only workspace admins can manage' }, 403);
  }

  // ─── Helpers ───────────────────────────────────────────────
  const audit = async (
    entity_type: string,
    entity_id: string | null,
    actionName: string,
    before: unknown,
    after: unknown,
  ) => {
    await admin.from('workspace_audit_log').insert({
      workspace_id,
      actor_user_id: callerId,
      entity_type,
      entity_id,
      action: actionName,
      before: before ?? null,
      after: after ?? null,
    });
  };

  /** Verifies a project belongs to this workspace before mutating. */
  const assertProjectInWorkspace = async (projectId: string) => {
    const { data: p } = await admin
      .from('projects')
      .select('id, workspace_id, visibility, name, owner_id, team_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!p) throw new Error('Project not found');
    if (p.workspace_id !== workspace_id) throw new Error('Project does not belong to this workspace');
    return p;
  };

  /** Verifies a team belongs to this workspace. */
  const assertTeamInWorkspace = async (teamId: string) => {
    const { data: t } = await admin
      .from('teams')
      .select('id, workspace_id, name, description')
      .eq('id', teamId)
      .maybeSingle();
    if (!t) throw new Error('Team not found');
    if (t.workspace_id !== workspace_id) throw new Error('Team does not belong to this workspace');
    return t;
  };

  const assertWorkspaceMember = async (userId: string) => {
    const { data: m } = await admin
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!m) throw new Error('User is not a member of this workspace');
    return m;
  };

  // ─── Actions ───────────────────────────────────────────────
  try {
    // ===== WORKSPACE MEMBERS =====
    if (action === 'create') {
      const { email, password, display_name, role } = body;
      if (!email || !password) return json({ error: 'email and password required' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
      const memberRole = ['admin', 'member', 'guest'].includes(role) ? role : 'member';

      let userId: string | null = null;
      const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = existingList?.users?.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
      );

      if (existing) {
        userId = existing.id;
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: display_name ?? email },
        });
        if (createErr) return json({ error: createErr.message }, 400);
        userId = created.user!.id;
      }

      const { error: insErr } = await admin
        .from('workspace_members')
        .upsert(
          { workspace_id, user_id: userId, role: memberRole },
          { onConflict: 'workspace_id,user_id' },
        );
      if (insErr) return json({ error: insErr.message }, 400);

      await audit('workspace_member', userId, 'create', null, { role: memberRole, email });
      return json({ ok: true, user_id: userId });
    }

    if (action === 'update_role') {
      const { user_id, role } = body;
      if (!user_id || !role) return json({ error: 'user_id and role required' }, 400);
      if (!WORKSPACE_ROLES.includes(role)) return json({ error: 'invalid role' }, 400);
      if (role === 'owner' && membership.role !== 'owner') {
        return json({ error: 'Only the owner can transfer ownership' }, 403);
      }

      const before = await assertWorkspaceMember(user_id);
      const { error } = await admin
        .from('workspace_members')
        .update({ role })
        .eq('workspace_id', workspace_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);

      await audit('workspace_member', user_id, 'role_change', before, { role });
      return json({ ok: true });
    }

    if (action === 'remove') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);

      const target = await assertWorkspaceMember(user_id);
      if (target.role === 'owner') {
        return json({ error: 'Cannot remove the workspace owner' }, 400);
      }

      const { error } = await admin
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspace_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);

      await audit('workspace_member', user_id, 'delete', target, null);
      return json({ ok: true });
    }

    if (action === 'update_member') {
      const { user_id, display_name, email, password } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      const before = await assertWorkspaceMember(user_id);

      // Update auth (email/password)
      const authPatch: Record<string, unknown> = {};
      if (typeof email === 'string' && email.trim()) authPatch.email = email.trim();
      if (typeof password === 'string' && password.length > 0) {
        if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
        authPatch.password = password;
      }
      if (typeof display_name === 'string') {
        authPatch.user_metadata = { full_name: display_name.trim() };
      }
      if (Object.keys(authPatch).length > 0) {
        const { error: authErr } = await admin.auth.admin.updateUserById(user_id, authPatch);
        if (authErr) return json({ error: authErr.message }, 400);
      }

      // Update profile display_name
      if (typeof display_name === 'string') {
        const { error: profErr } = await admin
          .from('profiles')
          .update({ display_name: display_name.trim() })
          .eq('user_id', user_id);
        if (profErr) return json({ error: profErr.message }, 400);
      }

      await audit('workspace_member', user_id, 'update', before, {
        display_name,
        email_changed: !!authPatch.email,
        password_changed: !!authPatch.password,
      });
      return json({ ok: true });
    }

    // ===== TEAMS =====
    if (action === 'team_create') {
      const { name, description } = body;
      if (!name?.trim()) return json({ error: 'name required' }, 400);
      const { data, error } = await admin
        .from('teams')
        .insert({ workspace_id, name, description: description || null })
        .select('id')
        .single();
      if (error) return json({ error: error.message }, 400);
      await audit('team', data.id, 'create', null, { name, description });
      return json({ ok: true, team_id: data.id });
    }

    if (action === 'team_update') {
      const { team_id, name, description } = body;
      if (!team_id) return json({ error: 'team_id required' }, 400);
      const before = await assertTeamInWorkspace(team_id);
      const { error } = await admin
        .from('teams')
        .update({ name: name ?? before.name, description: description ?? before.description })
        .eq('id', team_id);
      if (error) return json({ error: error.message }, 400);
      await audit('team', team_id, 'update', before, { name, description });
      return json({ ok: true });
    }

    if (action === 'team_delete') {
      const { team_id } = body;
      if (!team_id) return json({ error: 'team_id required' }, 400);
      const before = await assertTeamInWorkspace(team_id);
      const { error } = await admin.from('teams').delete().eq('id', team_id);
      if (error) return json({ error: error.message }, 400);
      await audit('team', team_id, 'delete', before, null);
      return json({ ok: true });
    }

    if (action === 'team_member_add') {
      const { team_id, user_id, role } = body;
      if (!team_id || !user_id) return json({ error: 'team_id and user_id required' }, 400);
      await assertTeamInWorkspace(team_id);
      await assertWorkspaceMember(user_id);
      const teamRole = TEAM_ROLES.includes(role) ? role : 'member';
      const { error } = await admin
        .from('team_members')
        .upsert({ team_id, user_id, role: teamRole }, { onConflict: 'team_id,user_id' });
      if (error) return json({ error: error.message }, 400);
      await audit('team_member', team_id, 'create', null, { user_id, role: teamRole });
      return json({ ok: true });
    }

    if (action === 'team_member_remove') {
      const { team_id, user_id } = body;
      if (!team_id || !user_id) return json({ error: 'team_id and user_id required' }, 400);
      await assertTeamInWorkspace(team_id);
      const { error } = await admin
        .from('team_members')
        .delete()
        .eq('team_id', team_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);
      await audit('team_member', team_id, 'delete', { user_id }, null);
      return json({ ok: true });
    }

    if (action === 'team_member_role') {
      const { team_id, user_id, role } = body;
      if (!team_id || !user_id || !role) return json({ error: 'team_id, user_id, role required' }, 400);
      if (!TEAM_ROLES.includes(role)) return json({ error: 'invalid team role' }, 400);
      await assertTeamInWorkspace(team_id);
      const { error } = await admin
        .from('team_members')
        .update({ role })
        .eq('team_id', team_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);
      await audit('team_member', team_id, 'role_change', null, { user_id, role });
      return json({ ok: true });
    }

    // ===== PROJECT MEMBERS =====
    if (action === 'project_member_add') {
      const { project_id, user_id, role } = body;
      if (!project_id || !user_id) return json({ error: 'project_id and user_id required' }, 400);
      await assertProjectInWorkspace(project_id);
      await assertWorkspaceMember(user_id);
      const pRole = PROJECT_ROLES.includes(role) ? role : 'editor';
      const { error } = await admin
        .from('project_members')
        .upsert({ project_id, user_id, role: pRole }, { onConflict: 'project_id,user_id' });
      if (error) return json({ error: error.message }, 400);
      await audit('project_member', project_id, 'create', null, { user_id, role: pRole });
      return json({ ok: true });
    }

    if (action === 'project_member_remove') {
      const { project_id, user_id } = body;
      if (!project_id || !user_id) return json({ error: 'project_id and user_id required' }, 400);
      await assertProjectInWorkspace(project_id);
      const { error } = await admin
        .from('project_members')
        .delete()
        .eq('project_id', project_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);
      await audit('project_member', project_id, 'delete', { user_id }, null);
      return json({ ok: true });
    }

    if (action === 'project_member_role') {
      const { project_id, user_id, role } = body;
      if (!project_id || !user_id || !role) {
        return json({ error: 'project_id, user_id, role required' }, 400);
      }
      if (!PROJECT_ROLES.includes(role)) return json({ error: 'invalid project role' }, 400);
      await assertProjectInWorkspace(project_id);
      const { error } = await admin
        .from('project_members')
        .update({ role })
        .eq('project_id', project_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);
      await audit('project_member', project_id, 'role_change', null, { user_id, role });
      return json({ ok: true });
    }

    // ===== PROJECT ↔ TEAM LINKS =====
    if (action === 'project_team_link') {
      const { project_id, team_id, default_role } = body;
      if (!project_id || !team_id) return json({ error: 'project_id and team_id required' }, 400);
      await assertProjectInWorkspace(project_id);
      await assertTeamInWorkspace(team_id);
      const dRole = PROJECT_ROLES.includes(default_role) ? default_role : 'editor';
      const { error } = await admin
        .from('project_teams')
        .upsert(
          { project_id, team_id, default_role: dRole, added_by: callerId },
          { onConflict: 'project_id,team_id' },
        );
      if (error) return json({ error: error.message }, 400);
      await audit('project_team_link', project_id, 'link', null, { team_id, default_role: dRole });
      return json({ ok: true });
    }

    if (action === 'project_team_unlink') {
      const { project_id, team_id } = body;
      if (!project_id || !team_id) return json({ error: 'project_id and team_id required' }, 400);
      await assertProjectInWorkspace(project_id);
      const { error } = await admin
        .from('project_teams')
        .delete()
        .eq('project_id', project_id)
        .eq('team_id', team_id);
      if (error) return json({ error: error.message }, 400);
      await audit('project_team_link', project_id, 'unlink', { team_id }, null);
      return json({ ok: true });
    }

    if (action === 'project_team_role') {
      const { project_id, team_id, default_role } = body;
      if (!project_id || !team_id || !default_role) {
        return json({ error: 'project_id, team_id, default_role required' }, 400);
      }
      if (!PROJECT_ROLES.includes(default_role)) {
        return json({ error: 'invalid project role' }, 400);
      }
      await assertProjectInWorkspace(project_id);
      const { error } = await admin
        .from('project_teams')
        .update({ default_role })
        .eq('project_id', project_id)
        .eq('team_id', team_id);
      if (error) return json({ error: error.message }, 400);
      await audit('project_team_link', project_id, 'role_change', null, { team_id, default_role });
      return json({ ok: true });
    }

    // ===== PROJECT VISIBILITY =====
    if (action === 'project_visibility_set') {
      const { project_id, visibility } = body;
      if (!project_id || !visibility) return json({ error: 'project_id and visibility required' }, 400);
      if (!VISIBILITIES.includes(visibility)) return json({ error: 'invalid visibility' }, 400);
      const before = await assertProjectInWorkspace(project_id);
      const { error } = await admin
        .from('projects')
        .update({ visibility })
        .eq('id', project_id);
      if (error) return json({ error: error.message }, 400);
      await audit('project_visibility', project_id, 'update',
        { visibility: before.visibility }, { visibility });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
