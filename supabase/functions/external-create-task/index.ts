// Edge function pública: permite que sistemas externos criem tarefas
// usando uma API Key gerada na UI de configurações.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const PRIORITY_MAP: Record<string, number> = {
  p1: 4, urgente: 4, urgent: 4, alta: 3, high: 3, p2: 3,
  media: 2, média: 2, medium: 2, p3: 2, baixa: 1, low: 1, p4: 1,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!apiKey) return json({ error: 'Missing x-api-key header' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const keyHash = await sha256(apiKey);
  const { data: keyRow, error: keyErr } = await admin
    .from('external_api_keys')
    .select('id, workspace_id, default_project_id, default_assignee_id, created_by, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (keyErr || !keyRow) return json({ error: 'Invalid API key' }, 401);
  if (keyRow.revoked_at) return json({ error: 'API key revoked' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const title = (body.title ?? '').toString().trim();
  if (!title) return json({ error: 'title is required' }, 400);

  const description = body.description ? String(body.description) : null;

  let priority = 1;
  if (body.priority != null) {
    const p = String(body.priority).toLowerCase();
    priority = PRIORITY_MAP[p] ?? Number(body.priority) || 1;
    if (priority < 1 || priority > 4) priority = 1;
  }

  let dueAt: string | null = null;
  if (body.due_at || body.dueAt || body.date) {
    const raw = body.due_at || body.dueAt || body.date;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return json({ error: 'Invalid date format' }, 400);
    dueAt = d.toISOString();
  }

  const projectId = body.project_id || keyRow.default_project_id;
  if (!projectId) {
    return json({ error: 'No project_id provided and no default project configured for this key' }, 400);
  }

  // Confirma que o projeto pertence ao workspace dessa key
  const { data: proj } = await admin
    .from('projects')
    .select('id, workspace_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!proj || proj.workspace_id !== keyRow.workspace_id) {
    return json({ error: 'Project not accessible by this API key' }, 403);
  }

  const { data: task, error: taskErr } = await admin
    .from('tasks')
    .insert({
      user_id: keyRow.created_by,
      created_by: keyRow.created_by,
      workspace_id: keyRow.workspace_id,
      project_id: projectId,
      title,
      description,
      priority,
      due_at: dueAt,
    })
    .select('id, title, due_at, priority, project_id')
    .single();

  if (taskErr || !task) return json({ error: taskErr?.message ?? 'Failed to create task' }, 500);

  // Atribui responsável padrão se houver
  if (keyRow.default_assignee_id) {
    await admin.from('task_assignees').insert({
      task_id: task.id,
      user_id: keyRow.default_assignee_id,
      assigned_by: keyRow.created_by,
    });
  }

  // Atualiza last_used
  await admin
    .from('external_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id);

  return json({ ok: true, task });
});
