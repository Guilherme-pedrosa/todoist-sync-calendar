// Edge function pública: permite que sistemas externos criem tarefas
// usando uma API Key gerada na UI de configurações.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key, x-sync-source',
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

function normalizeSubtasks(body: any): any[] {
  const raw = body.subtasks || body.subtarefas || body.sub_tarefas || body.children || body.items || body.checklist;
  if (Array.isArray(raw) && raw.length > 0) return raw;

  const text = body.description || body.notes || body.observations || body.observacoes || body.message || body.text;
  const problemItems = extractProblemItemsFromDescription(text);
  if (problemItems.length > 0) return problemItems;

  return extractCorrectiveItemFromDescription(text);
}

function extractProblemItemsFromDescription(raw: unknown): any[] {
  if (!raw) return [];

  const lines = String(raw).replace(/\r/g, '').split('\n');
  const items: { title: string }[] = [];
  let inProblemSection = false;
  let inPostResultBullets = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    if (/^itens?\s+com\s+problemas?\s*:/.test(normalized)) {
      inProblemSection = true;
      continue;
    }

    if (/^resultado\s*:/.test(normalized)) {
      inPostResultBullets = true;
      continue;
    }

    const shouldReadProblemBullet = inProblemSection || inPostResultBullets;
    if (!shouldReadProblemBullet) continue;

    if (!trimmed) continue;

    if (!/^[•*-]\s+/.test(trimmed)) {
      if (/^[\p{L}\s]+:/u.test(trimmed)) break;
      continue;
    }

    const title = trimmed.replace(/^[•*-]\s+/, '').trim();
    if (title) items.push({ title });
  }

  return items;
}

function extractCorrectiveItemFromDescription(raw: unknown): any[] {
  if (!raw) return [];

  const lines = String(raw).replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const typeIndex = lines.findIndex((line) =>
    /^tipo\s*:\s*corretiva\s*$/i.test(line.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
  );
  if (typeIndex === -1) return [];

  const title = lines.slice(typeIndex + 1).find((line) => !/^(veiculo|veículo|data|tecnico|técnico|resultado)\s*:/i.test(line));
  return title ? [{ title }] : [];
}

function readSubtaskTitle(item: any): string {
  if (typeof item === 'string') return item.trim();
  return String(item?.title ?? item?.name ?? item?.description ?? '').trim();
}

function readSubtaskExternalRef(parentRef: string | null, item: any, index: number): string | null {
  if (typeof item !== 'object' || item === null) return parentRef ? `${parentRef}:subtask:${index + 1}` : null;
  const raw = item.external_ref ?? item.externalRef ?? item.ref ?? item.id;
  return raw ? String(raw) : (parentRef ? `${parentRef}:subtask:${index + 1}` : null);
}

function parsePriority(raw: unknown, fallback = 1) {
  if (raw == null) return fallback;
  const p = String(raw).toLowerCase();
  const priority = PRIORITY_MAP[p] ?? (Number(raw) || fallback);
  return priority >= 1 && priority <= 4 ? priority : fallback;
}

function parseDueAt(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(raw as string);
  if (isNaN(d.getTime())) throw new Error('Invalid date format');
  return d.toISOString();
}

function splitDueAt(dueAt: string | null) {
  if (!dueAt) return { due_date: null, due_time: null };
  const d = new Date(dueAt);
  return { due_date: d.toISOString().slice(0, 10), due_time: d.toISOString().slice(11, 19) };
}

function parseCompleted(raw: unknown): boolean | null {
  if (raw == null) return null;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return parseCompleted(obj.completed ?? obj.done ?? obj.value ?? obj.code ?? obj.name ?? obj.title ?? obj.label ?? obj.status);
  }

  const value = String(raw).trim().toLowerCase();
  if (!value) return null;

  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (['true', '1', 'yes', 'sim', 'done', 'completed', 'complete', 'closed', 'resolved', 'finished', 'concluido', 'concluida', 'concluidos', 'concluidas', 'finalizado', 'finalizada', 'finalizados', 'finalizadas', 'fechado', 'fechada', 'fechados', 'fechadas', 'encerrado', 'encerrada', 'resolvido', 'resolvida', 'solucionado', 'solucionada'].includes(normalized)) return true;
  if (['false', '0', 'no', 'nao', 'open', 'opened', 'pending', 'pendente', 'em aberto', 'aberto', 'aberta', 'abertos', 'abertas', 'ativo', 'ativa', 'andamento', 'em andamento'].includes(normalized)) return false;

  return null;
}

function readCompleted(source: any): { completed: boolean; completed_at: string | null } | null {
  const completed = parseCompleted(
    source?.completed ??
      source?.is_completed ??
      source?.isCompleted ??
      source?.done ??
      source?.closed ??
      source?.resolved ??
      source?.finished ??
      source?.finalizada ??
      source?.finalizado ??
      source?.concluida ??
      source?.concluido ??
      source?.completion_status ??
      source?.completionStatus ??
      source?.state ??
      source?.situacao ??
      source?.status,
  );

  const completedAtRaw = source?.completed_at ?? source?.completedAt ?? source?.finished_at ?? source?.finishedAt ?? source?.closed_at ?? source?.closedAt ?? source?.resolved_at ?? source?.resolvedAt;
  const completedAt = completedAtRaw ? parseDueAt(completedAtRaw) : null;

  if (completed === null && !completedAt) return null;

  const isCompleted = completed ?? true;
  return {
    completed: isCompleted,
    completed_at: isCompleted ? (completedAt || new Date().toISOString()) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!apiKey) return json({ error: 'Missing x-api-key header' }, 401);

  const syncSource = req.headers.get('x-sync-source') || null;

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

  const priority = parsePriority(body.priority, 1);

  let dueAt: string | null = null;
  try {
    dueAt = parseDueAt(body.due_at || body.dueAt || body.date);
  } catch {
    return json({ error: 'Invalid date format' }, 400);
  }

  // Tarefas da Frota nunca devem vir com data/horário automático — usuário define manualmente.
  const isFleet =
    /frota|fleet/i.test(syncSource || '') ||
    /^\s*\[?\s*frota\b/i.test(title);
  if (isFleet) {
    dueAt = null;
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

  const externalRef = body.external_ref ? String(body.external_ref) : null;
  const externalSource = body.external_source ? String(body.external_source) : (syncSource || null);
  const assignee = body.assignee ? String(body.assignee) : null;

  // Decompose dueAt -> due_date / due_time (campos legados usados pelo app)
  const { due_date, due_time } = splitDueAt(dueAt);
  const completion = readCompleted(body);

  const taskPayload: Record<string, unknown> = {
    user_id: keyRow.created_by,
    created_by: keyRow.created_by,
    workspace_id: keyRow.workspace_id,
    project_id: projectId,
    title,
    description,
    priority,
    due_at: dueAt,
    due_date,
    due_time,
    external_ref: externalRef,
    external_source: externalSource,
    assignee,
    last_sync_source: syncSource,
    ...(completion ? { completed: completion.completed, completed_at: completion.completed_at } : {}),
  };

  let task: any = null;
  let taskErr: any = null;

  if (externalRef) {
    // Tenta localizar existente (inclui soft-deleted para bloquear ressurreição)
    const { data: existing } = await admin
      .from('tasks')
      .select('id, deleted_at')
      .eq('external_ref', externalRef)
      .maybeSingle();

    if (existing?.deleted_at) {
      console.warn('[external-create-task] rejected: task soft-deleted', {
        external_ref: externalRef,
        title,
        x_sync_source: syncSource,
        scope: 'parent',
      });
      return json({
        ok: false,
        code: 'GONE',
        error: 'task_was_deleted_by_user',
        message: 'Esta tarefa foi excluída pelo usuário e não será recriada. Para reabrir, envie um novo external_ref.',
        task_id: existing.id,
        external_ref: externalRef,
      }, 409);
    }

    if (existing?.id) {
      const { data: updated, error: updErr } = await admin
        .from('tasks')
        .update({
          title,
          description,
          priority,
          due_at: dueAt,
          due_date,
          due_time,
          assignee,
          external_source: externalSource,
          last_sync_source: syncSource,
          ...(completion ? { completed: completion.completed, completed_at: completion.completed_at } : {}),
        })
        .eq('id', existing.id)
        .select('id, title, due_at, priority, project_id, external_ref')
        .single();
      task = updated;
      taskErr = updErr;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('tasks')
        .insert(taskPayload)
        .select('id, title, due_at, priority, project_id, external_ref')
        .single();
      task = inserted;
      taskErr = insErr;
    }
  } else {
    const { data: inserted, error: insErr } = await admin
      .from('tasks')
      .insert(taskPayload)
      .select('id, title, due_at, priority, project_id, external_ref')
      .single();
    task = inserted;
    taskErr = insErr;
  }

  if (taskErr || !task) return json({ error: taskErr?.message ?? 'Failed to create task' }, 500);

  // Vínculo FleetDesk (upsert)
  if (externalRef) {
    await admin
      .from('fleetdesk_task_links')
      .upsert(
        {
          task_id: task.id,
          external_ref: externalRef,
          last_synced_at: new Date().toISOString(),
          last_sync_source: syncSource,
        },
        { onConflict: 'external_ref' },
      );
  }

  // Atribui responsável padrão se houver
  if (keyRow.default_assignee_id) {
    await admin.from('task_assignees').insert({
      task_id: task.id,
      user_id: keyRow.default_assignee_id,
      assigned_by: keyRow.created_by,
    }).select();
  }

  const subtasks = normalizeSubtasks(body);
  for (const [index, item] of subtasks.entries()) {
    const subTitle = readSubtaskTitle(item);
    if (!subTitle) continue;
    const subExternalRef = readSubtaskExternalRef(externalRef, item, index);
    const subDueAt = parseDueAt(item?.due_at || item?.dueAt || item?.date || dueAt);
    const split = splitDueAt(subDueAt);
    const subCompletion = typeof item === 'object' && item !== null ? readCompleted(item) : null;
    const subPayload = {
      user_id: keyRow.created_by,
      created_by: keyRow.created_by,
      workspace_id: keyRow.workspace_id,
      project_id: projectId,
      parent_id: task.id,
      title: subTitle,
      description: typeof item === 'object' && item?.notes ? String(item.notes) : null,
      priority: parsePriority(item?.priority, priority),
      due_at: subDueAt,
      due_date: split.due_date,
      due_time: split.due_time,
      external_ref: subExternalRef,
      external_source: externalSource,
      assignee: typeof item === 'object' && item?.assignee ? String(item.assignee) : assignee,
      last_sync_source: syncSource,
      ...(subCompletion ? { completed: subCompletion.completed, completed_at: subCompletion.completed_at } : {}),
    };
    // Pré-check: subtask com mesmo external_ref já apagada pelo usuário?
    if (subExternalRef) {
      const { data: existingSub } = await admin
        .from('tasks')
        .select('id, deleted_at')
        .eq('external_ref', subExternalRef)
        .maybeSingle();
      if (existingSub?.deleted_at) {
        console.warn('[external-create-task] rejected: task soft-deleted', {
          external_ref: subExternalRef,
          title: subTitle,
          x_sync_source: syncSource,
          scope: 'subtask',
          parent_external_ref: externalRef,
        });
        return json({
          ok: false,
          code: 'GONE',
          error: 'task_was_deleted_by_user',
          message: 'Esta subtarefa foi excluída pelo usuário e não será recriada. Para reabrir, envie um novo external_ref.',
          task_id: existingSub.id,
          external_ref: subExternalRef,
        }, 409);
      }
    }
    const query = subExternalRef
      ? admin.from('tasks').upsert(subPayload, { onConflict: 'external_ref' })
      : admin.from('tasks').insert(subPayload);
    await query.select('id').single();
  }

  // Atualiza last_used
  await admin
    .from('external_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id);

  return json({ ok: true, id: task.id, external_ref: task.external_ref ?? externalRef, task });
});
