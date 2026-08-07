// Endpoint público para receber reuniões do Plaud via Zapier.
// Autenticação: header x-api-key (ou ?key=) com uma API Key criada em Configurações.
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

function pick(body: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 1_000_000_000) {
    return new Date(asNum < 1e12 ? asNum * 1000 : asNum).toISOString();
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const apiKey =
    req.headers.get('x-api-key') ||
    url.searchParams.get('key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!apiKey) return json({ error: 'Missing x-api-key' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: keyRow } = await admin
    .from('external_api_keys')
    .select('id, created_by, revoked_at')
    .eq('key_hash', await sha256(apiKey))
    .maybeSingle();

  if (!keyRow) return json({ error: 'Invalid API key' }, 401);
  if (keyRow.revoked_at) return json({ error: 'API key revoked' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Permite direcionar a reunião para outro usuário via e-mail
  let userId = keyRow.created_by as string;
  const targetEmail = pick(body, ['user_email', 'email', 'owner_email']);
  if (targetEmail) {
    const { data: prof } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', targetEmail)
      .maybeSingle();
    if (prof?.id) userId = prof.id as string;
  }

  const title =
    pick(body, ['title', 'name', 'meeting_title', 'file_name', 'subject']) ?? 'Reunião Plaud';
  const externalId = pick(body, ['external_id', 'id', 'plaud_id', 'file_id', 'record_id']);
  const meetingDate = parseDate(
    pick(body, ['meeting_date', 'date', 'created_at', 'start_time', 'recorded_at', 'timestamp']),
  );
  const durationMinutes = parseDuration(
    pick(body, ['duration_minutes', 'minutes', 'duration']),
  );
  const summary = pick(body, ['summary', 'ai_summary', 'notes', 'resumo']);
  const transcript = pick(body, ['transcript', 'transcription', 'text', 'content', 'body']);
  const audioUrl = pick(body, ['audio_url', 'audio', 'file_url', 'url', 'download_url']);
  const language = pick(body, ['language', 'lang']);

  const row = {
    user_id: userId,
    external_id: externalId,
    title,
    meeting_date: meetingDate,
    duration_minutes: durationMinutes,
    language,
    summary,
    transcript,
    audio_url: audioUrl,
    source: 'plaud',
    raw: body,
  };

  const query = externalId
    ? admin.from('plaud_meetings').upsert(row, { onConflict: 'user_id,external_id' }).select('id').maybeSingle()
    : admin.from('plaud_meetings').insert(row).select('id').maybeSingle();

  const { data, error } = await query;
  if (error) {
    console.error('plaud-webhook insert failed:', error.message);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, id: data?.id ?? null });
});
