// Edge function: admin-manage-members
// Allows workspace owners/admins to create, update role, or remove members.
// Uses service_role to create auth users since signups are disabled.

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

  // Check caller is owner|admin of the workspace
  const { data: membership } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', callerId)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return json({ error: 'Forbidden — only workspace admins can manage members' }, 403);
  }

  try {
    if (action === 'create') {
      const { email, password, display_name, role } = body;
      if (!email || !password) return json({ error: 'email and password required' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
      const memberRole = ['admin', 'member', 'guest'].includes(role) ? role : 'member';

      // Try to find existing user
      let userId: string | null = null;
      const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = existingList?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

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

      // Add to workspace
      const { error: insErr } = await admin
        .from('workspace_members')
        .upsert({ workspace_id, user_id: userId, role: memberRole }, { onConflict: 'workspace_id,user_id' });
      if (insErr) return json({ error: insErr.message }, 400);

      return json({ ok: true, user_id: userId });
    }

    if (action === 'update_role') {
      const { user_id, role } = body;
      if (!user_id || !role) return json({ error: 'user_id and role required' }, 400);
      if (!['owner', 'admin', 'member', 'guest'].includes(role)) return json({ error: 'invalid role' }, 400);

      // Only owner can promote/demote owners
      if (role === 'owner' && membership.role !== 'owner') {
        return json({ error: 'Only the owner can transfer ownership' }, 403);
      }

      const { error } = await admin
        .from('workspace_members')
        .update({ role })
        .eq('workspace_id', workspace_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'remove') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id required' }, 400);

      // Prevent removing the only owner
      const { data: target } = await admin
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace_id)
        .eq('user_id', user_id)
        .maybeSingle();
      if (target?.role === 'owner') {
        return json({ error: 'Cannot remove the workspace owner' }, 400);
      }

      const { error } = await admin
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspace_id)
        .eq('user_id', user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
