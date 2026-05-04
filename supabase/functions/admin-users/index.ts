// Edge function: admin-users
// Global user management for productivity admins (cross-workspace).
// Auth: caller must be a row in public.productivity_admins.
// Actions: list, get, update_profile, reset_password, remove_from_workspace.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401);
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Authorization: must be productivity admin
  const { data: padmin } = await admin
    .from('productivity_admins')
    .select('user_id, is_super')
    .eq('user_id', callerId)
    .maybeSingle();
  if (!padmin) return json({ error: 'Forbidden — productivity admin only' }, 403);
  const isSuper = !!padmin.is_super;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const action = body?.action as string | undefined;
  if (!action) return json({ error: 'Missing action' }, 400);

  try {
    // ───── LIST ─────
    if (action === 'list') {
      // Pull all auth users (paginated) + profile + workspace memberships + today's stats
      const allUsers: any[] = [];
      let page = 1;
      const perPage = 200;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return json({ error: error.message }, 400);
        if (!data?.users?.length) break;
        allUsers.push(...data.users);
        if (data.users.length < perPage) break;
        page++;
        if (page > 20) break; // safety
      }

      const userIds = allUsers.map((u) => u.id);
      if (userIds.length === 0) return json({ users: [] });

      // Profiles
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, display_name, avatar_url, last_seen_at')
        .in('user_id', userIds);
      const profByUser = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      // Workspace memberships
      const { data: memberships } = await admin
        .from('workspace_members')
        .select('user_id, role, workspace_id, workspaces(id, name, is_personal)')
        .in('user_id', userIds);
      const memByUser = new Map<string, any[]>();
      for (const m of memberships || []) {
        const list = memByUser.get(m.user_id) || [];
        list.push(m);
        memByUser.set(m.user_id, list);
      }

      // Today's productivity stats (aggregate across workspaces for the day)
      const today = new Date().toISOString().slice(0, 10);
      const { data: stats } = await admin
        .from('daily_activity_stats')
        .select(
          'user_id, day, online_seconds, active_seconds, idle_seconds, tasks_completed, tasks_completed_inbox, tasks_completed_with_project, activity_score, last_seen_at',
        )
        .eq('day', today)
        .in('user_id', userIds);
      const statsByUser = new Map<string, any>();
      for (const s of stats || []) {
        const cur = statsByUser.get(s.user_id);
        if (!cur) {
          statsByUser.set(s.user_id, { ...s });
        } else {
          cur.online_seconds += s.online_seconds || 0;
          cur.active_seconds += s.active_seconds || 0;
          cur.idle_seconds += s.idle_seconds || 0;
          cur.tasks_completed += s.tasks_completed || 0;
          cur.tasks_completed_inbox += s.tasks_completed_inbox || 0;
          cur.tasks_completed_with_project += s.tasks_completed_with_project || 0;
          cur.activity_score = Math.max(cur.activity_score || 0, s.activity_score || 0);
          if (s.last_seen_at && (!cur.last_seen_at || s.last_seen_at > cur.last_seen_at)) {
            cur.last_seen_at = s.last_seen_at;
          }
        }
      }

      const users = allUsers.map((u) => {
        const prof = profByUser.get(u.id);
        const memberships = memByUser.get(u.id) || [];
        const todayStats = statsByUser.get(u.id) || null;
        return {
          user_id: u.id,
          email: u.email,
          display_name:
            prof?.display_name ||
            (u.user_metadata as any)?.full_name ||
            (u.user_metadata as any)?.name ||
            null,
          avatar_url: prof?.avatar_url || (u.user_metadata as any)?.avatar_url || null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          last_seen_at: prof?.last_seen_at || null,
          email_confirmed_at: u.email_confirmed_at,
          banned_until: (u as any).banned_until || null,
          workspaces: memberships.map((m: any) => ({
            workspace_id: m.workspace_id,
            role: m.role,
            name: m.workspaces?.name || '—',
            is_personal: !!m.workspaces?.is_personal,
          })),
          today: todayStats
            ? {
                online_seconds: todayStats.online_seconds || 0,
                active_seconds: todayStats.active_seconds || 0,
                idle_seconds: todayStats.idle_seconds || 0,
                tasks_completed: todayStats.tasks_completed || 0,
                tasks_completed_inbox: todayStats.tasks_completed_inbox || 0,
                tasks_completed_with_project: todayStats.tasks_completed_with_project || 0,
                activity_score: todayStats.activity_score || 0,
                last_seen_at: todayStats.last_seen_at || null,
              }
            : null,
        };
      });

      // Sort: most recently active first
      users.sort((a, b) => {
        const ta = a.today?.last_seen_at || a.last_seen_at || a.last_sign_in_at || '';
        const tb = b.today?.last_seen_at || b.last_seen_at || b.last_sign_in_at || '';
        return tb.localeCompare(ta);
      });

      return json({ users });
    }

    // ───── UPDATE PROFILE / EMAIL / PASSWORD ─────
    if (action === 'update_profile') {
      const { user_id, display_name, email, password } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);

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

      if (typeof display_name === 'string') {
        await admin
          .from('profiles')
          .update({ display_name: display_name.trim() })
          .eq('user_id', user_id);
      }

      return json({ ok: true });
    }

    // ───── RESET PASSWORD (sets a new one directly) ─────
    if (action === 'reset_password') {
      const { user_id, password } = body;
      if (!user_id || !password) return json({ error: 'user_id and password required' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ───── REMOVE FROM WORKSPACE ─────
    if (action === 'remove_from_workspace') {
      const { user_id, workspace_id } = body;
      if (!user_id || !workspace_id) return json({ error: 'user_id and workspace_id required' }, 400);
      // Don't allow removing the workspace owner
      const { data: ws } = await admin
        .from('workspaces')
        .select('owner_id')
        .eq('id', workspace_id)
        .maybeSingle();
      if (ws?.owner_id === user_id) return json({ error: 'Cannot remove workspace owner' }, 400);
      const { error } = await admin
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspace_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ───── DELETE USER (super only) ─────
    if (action === 'delete_user') {
      if (!isSuper) return json({ error: 'Forbidden — super admin only' }, 403);
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);
      if (user_id === callerId) return json({ error: 'Cannot delete yourself' }, 400);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    return json({ error: e?.message || 'Unknown error' }, 500);
  }
});
