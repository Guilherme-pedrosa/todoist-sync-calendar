// Gerencia chaves de API externas (criar, listar, revogar).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function sha256(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `tfk_${b64}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
  if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
  const userId = claims.claims.sub as string;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === 'list') {
    const { workspace_id } = body;
    if (!workspace_id) return json({ error: 'workspace_id required' }, 400);
    const { data, error } = await admin
      .from('external_api_keys')
      .select('id, name, key_prefix, default_project_id, default_assignee_id, created_at, last_used_at, revoked_at')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 400);
    return json({ keys: data ?? [] });
  }

  if (action === 'create') {
    const { workspace_id, name, default_project_id, default_assignee_id } = body;
    if (!workspace_id || !name) return json({ error: 'workspace_id and name required' }, 400);

    // Confirma admin do workspace
    const { data: isAdmin } = await admin.rpc('is_workspace_admin', {
      _workspace_id: workspace_id,
      _user_id: userId,
    });
    if (!isAdmin) return json({ error: 'Only workspace admins can create API keys' }, 403);

    const plain = generateKey();
    const hash = await sha256(plain);
    const prefix = plain.slice(0, 11);

    const { data, error } = await admin
      .from('external_api_keys')
      .insert({
        name,
        key_hash: hash,
        key_prefix: prefix,
        workspace_id,
        default_project_id: default_project_id || null,
        default_assignee_id: default_assignee_id || null,
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, id: data.id, key: plain, prefix });
  }

  if (action === 'revoke') {
    const { id } = body;
    if (!id) return json({ error: 'id required' }, 400);
    const { error } = await admin
      .from('external_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
