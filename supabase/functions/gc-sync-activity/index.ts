import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GC_BASE = 'https://api.gestaoclick.com';
const ACCESS_TOKEN = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN')!;
const SECRET_TOKEN = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN')!;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gc-sync-activity`;

// Tempo máximo de processamento por invocação antes de re-encadear
const CHUNK_BUDGET_MS = 90_000;
const LOG_CHUNK_DAYS = 30;

interface Bucket {
  day: string;
  gc_user_id: string;
  gc_user_name: string;
  vendas_count: number; vendas_valor: number;
  os_count: number; os_valor: number;
  orcamentos_count: number; orcamentos_valor: number;
  nfs_count: number; nfs_valor: number;
  entrada_notas: number;
  separacao_pecas: number;
  entrega_pecas: number;
  tratativa_incorreta: number;
  cadastro_produto: number;
  abertura_os: number;
  abertura_compras: number;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function gcFetch(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(params as any).toString();
  const url = `${GC_BASE}${path}?${qs}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, {
      headers: {
        'access-token': ACCESS_TOKEN,
        'secret-access-token': SECRET_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`GC ${path} ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  throw new Error(`GC ${path} rate-limit exceeded`);
}

async function* paginate(path: string, baseParams: Record<string, string | number>) {
  let page = 1;
  while (true) {
    const json = await gcFetch(path, { ...baseParams, pagina: page });
    const data: any[] = json?.data ?? [];
    for (const row of data) yield row;
    const next = json?.meta?.proxima_pagina;
    if (!next) break;
    page = Number(next);
    await sleep(350);
  }
}

function emptyBucket(day: string, uid: string, uname: string): Bucket {
  return {
    day, gc_user_id: uid, gc_user_name: uname || 'Sem nome',
    vendas_count: 0, vendas_valor: 0,
    os_count: 0, os_valor: 0,
    orcamentos_count: 0, orcamentos_valor: 0,
    nfs_count: 0, nfs_valor: 0,
    entrada_notas: 0, separacao_pecas: 0, entrega_pecas: 0,
    tratativa_incorreta: 0, cadastro_produto: 0, abertura_os: 0, abertura_compras: 0,
  };
}

function bkey(buckets: Map<string, Bucket>, day: string, uid: string, uname: string) {
  const k = `${day}|${uid}`;
  let b = buckets.get(k);
  if (!b) { b = emptyBucket(day, uid, uname); buckets.set(k, b); }
  return b;
}

function pickUser(row: any): { id: string; name: string } | null {
  if (row.vendedor_id) return { id: String(row.vendedor_id), name: row.nome_vendedor || '' };
  if (row.tecnico_id) return { id: String(row.tecnico_id), name: row.nome_tecnico || '' };
  if (row.usuario_id) return { id: String(row.usuario_id), name: row.nome_usuario || '' };
  return null;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysIso(value: string, days: number) {
  const d = parseIsoDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

const minIso = (a: string, b: string) => (a <= b ? a : b);

function sumBucketActivity(rows: Bucket[]) {
  return rows.reduce((total, r) => total
    + r.vendas_count + r.os_count + r.orcamentos_count + r.nfs_count
    + r.entrada_notas + r.separacao_pecas + r.entrega_pecas
    + r.tratativa_incorreta + r.cadastro_produto + r.abertura_os + r.abertura_compras, 0);
}

function bucketsToObj(map: Map<string, Bucket>): Record<string, Bucket> {
  const out: Record<string, Bucket> = {};
  for (const [k, v] of map.entries()) out[k] = v;
  return out;
}
function objToBuckets(obj: Record<string, Bucket> | null | undefined): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  if (!obj) return map;
  for (const [k, v] of Object.entries(obj)) map.set(k, v);
  return map;
}

async function selfInvoke() {
  // Re-invoca a própria função para continuar de onde parou
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ continue: true }),
  });
  if (!response.ok) console.error('self-invoke failed', response.status, await response.text());
}

async function runSync(supabase: any) {
  const startedAt = Date.now();
  const updateStatus = async (patch: Record<string, any>) => {
    await supabase.from('gc_sync_status').upsert({
      id: 'current', updated_at: new Date().toISOString(), ...patch,
    });
  };

  // Carrega estado atual
  const { data: state } = await supabase.from('gc_sync_status').select('*').eq('id', 'current').maybeSingle();
  if (!state || state.status !== 'running') return;

  const data_inicio: string = state.data_inicio;
  const data_fim: string = state.data_fim;
  let phase: string = state.phase || 'documents';
  const buckets = objToBuckets(state.bucket_state);

  try {
    // FASE 1: documentos
    if (phase === 'documents') {
      const counts: Record<string, number> = (state.fetched as any) || {};
      const sources = [
        { path: '/vendas', kind: 'vendas' as const, label: 'vendas' },
        { path: '/ordens_servicos', kind: 'os' as const, label: 'ordens de serviço' },
        { path: '/orcamentos', kind: 'orcamentos' as const, label: 'orçamentos' },
        { path: '/notas_fiscais_produtos', kind: 'nfs' as const, label: 'NFs produtos' },
        { path: '/notas_fiscais_consumidores', kind: 'nfs' as const, label: 'NFCe' },
        { path: '/notas_fiscais_servicos', kind: 'nfs' as const, label: 'NFSe' },
      ];
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (counts[s.path] !== undefined) continue;
        await updateStatus({ stage: `Baixando ${s.label}...`, progress: 5 + Math.floor((i / sources.length) * 35) });
        let n = 0;
        try {
          for await (const row of paginate(s.path, { data_inicio, data_fim })) {
            const day: string = (row.data || row.data_emissao || row.data_envio || row.data_entrada || row.data_venda || row.data_cadastro || '').slice(0, 10);
            if (!day) continue;
            const u = pickUser(row);
            if (!u) continue;
            const valor = Number(row.valor_total ?? row.valor ?? 0) || 0;
            const b = bkey(buckets, day, u.id, u.name);
            if (s.kind === 'vendas') { b.vendas_count++; b.vendas_valor += valor; }
            else if (s.kind === 'os') { b.os_count++; b.os_valor += valor; }
            else if (s.kind === 'orcamentos') { b.orcamentos_count++; b.orcamentos_valor += valor; }
            else if (s.kind === 'nfs') { b.nfs_count++; b.nfs_valor += valor; }
            n++;
          }
        } catch (e) { console.error(`Falhou ${s.path}:`, e); }
        counts[s.path] = n;

        if (Date.now() - startedAt > CHUNK_BUDGET_MS) {
          await updateStatus({
            stage: `Pausando p/ continuar... (${s.label} concluído)`,
            bucket_state: bucketsToObj(buckets), fetched: counts, phase: 'documents',
          });
          await selfInvoke();
          return;
        }
      }
      phase = 'usuarios';
      await updateStatus({ phase, fetched: counts, bucket_state: bucketsToObj(buckets) });
    }

    // FASE 2: usuários
    let nameToId = new Map<string, string>();
    if (phase === 'usuarios') {
      await updateStatus({ stage: 'Baixando usuários...', progress: 45 });
      try {
        for await (const u of paginate('/usuarios', {})) {
          const nome = String(u?.nome ?? '').trim();
          const id = String(u?.id ?? '').trim();
          if (nome && id) nameToId.set(nome.toLowerCase(), id);
        }
      } catch (e) { console.error('Falhou /usuarios:', e); }
      // guarda mapa em fetched._users
      const counts = (state.fetched as any) || {};
      counts._users = Object.fromEntries(nameToId);
      phase = 'logs';
      await updateStatus({ phase, fetched: counts, log_page: 1 });
    } else {
      const counts = (state.fetched as any) || {};
      if (counts._users) nameToId = new Map(Object.entries(counts._users as Record<string, string>));
    }

    // FASE 3: logs (pode levar muitas invocações)
    if (phase === 'logs') {
      let logFrom = state.log_range_start || data_inicio;
      let logPage = state.log_page ?? 1;
      let totalPages = state.log_total_pages ?? 0;

      while (true) {
        const logTo = minIso(addDaysIso(logFrom, LOG_CHUNK_DAYS - 1), data_fim);
        const json = await gcFetch('/logs', { data_inicio: logFrom, data_fim: logTo, pagina: logPage });
        const data: any[] = json?.data ?? [];
        if (!totalPages) totalPages = Number(json?.meta?.total_paginas ?? 1);
        for (const log of data) {
          const day: string = String(log?.cadastrado_em ?? '').slice(0, 10);
          const nome = String(log?.nome_usuario ?? '').trim();
          if (!day || !nome) continue;
          const desc = String(log?.descricao ?? '');
          const mod = String(log?.modulo ?? '');
          const uid = nameToId.get(nome.toLowerCase()) ?? `nome:${nome}`;
          const b = bkey(buckets, day, uid, nome);

          if (mod === 'compras' && /para Finalizado/i.test(desc)) {
            b.entrada_notas++;
          } else if (mod === 'compras' && /^Adicionou\s+(a\s+)?compra/i.test(desc)) {
            b.abertura_compras++;
          } else if (mod === 'ordens_servicos' && /para PEDIDO CONFERIDO AGUARDANDO EXECU/i.test(desc)) {
            b.separacao_pecas++;
          } else if (mod === 'ordens_servicos' && /para RETIRADA PELO TECNICO/i.test(desc)) {
            b.entrega_pecas++;
          } else if (mod === 'ordens_servicos' && /para AG CORRE[CÇ]/i.test(desc) && /DEVOLVIDO PELO T[EÉ]CNICO/i.test(desc)) {
            b.tratativa_incorreta++;
          } else if (mod === 'produtos' && /^Adicionou o produto/i.test(desc)) {
            b.cadastro_produto++;
          } else if ((mod === 'orcamentos' || mod === 'orcamentos_servicos') && /para Aprovado - OS Gerada/i.test(desc)) {
            b.abertura_os++;
          }
        }
        const next = json?.meta?.proxima_pagina;
        const totalDays = Math.max(1, Math.ceil((parseIsoDate(data_fim).getTime() - parseIsoDate(data_inicio).getTime()) / 86_400_000) + 1);
        const completedDays = Math.max(0, Math.floor((parseIsoDate(logFrom).getTime() - parseIsoDate(data_inicio).getTime()) / 86_400_000));
        const chunkPct = (logPage / Math.max(totalPages, 1)) * LOG_CHUNK_DAYS;
        const pct = 50 + Math.floor(((completedDays + chunkPct) / totalDays) * 42);
        await updateStatus({
          stage: `Logs ${logFrom} a ${logTo} · página ${logPage}/${totalPages}...`,
          progress: Math.min(pct, 92),
          log_page: logPage,
          log_total_pages: totalPages,
          log_range_start: logFrom,
        });

        if (!next) {
          const nextRangeStart = addDaysIso(logTo, 1);
          if (nextRangeStart > data_fim) {
            phase = 'persist';
            break;
          }
          logFrom = nextRangeStart;
          logPage = 1;
          totalPages = 0;
          await updateStatus({
            stage: `Avançando logs para ${logFrom}...`,
            log_page: 1,
            log_total_pages: null,
            log_range_start: logFrom,
            bucket_state: bucketsToObj(buckets),
            phase: 'logs',
          });
          if (Date.now() - startedAt > CHUNK_BUDGET_MS) {
            await selfInvoke();
            return;
          }
          continue;
        }
        logPage = Number(next);

        if (Date.now() - startedAt > CHUNK_BUDGET_MS) {
          await updateStatus({
            stage: `Pausando logs em ${logFrom} · página ${logPage}/${totalPages}...`,
            log_page: logPage,
            log_total_pages: totalPages,
            log_range_start: logFrom,
            bucket_state: bucketsToObj(buckets),
            phase: 'logs',
          });
          await selfInvoke();
          return;
        }
        await sleep(75);
      }
      await updateStatus({ phase, bucket_state: bucketsToObj(buckets) });
    }

    // FASE 4: persistir
    await updateStatus({ stage: 'Salvando no banco...', progress: 94 });
    const rows = Array.from(buckets.values());
    if (rows.length > 0) {
      await supabase.from('gc_daily_activity').delete().gte('day', data_inicio).lte('day', data_fim);
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk).map(r => ({ ...r, computed_at: new Date().toISOString() }));
        const { error } = await supabase.from('gc_daily_activity').insert(slice);
        if (error) console.error('insert error', error);
      }
    }

    const counts = (state.fetched as any) || {};
    delete counts._users;
    const activityTotal = sumBucketActivity(rows);
    await updateStatus({
      status: 'done', stage: 'Concluído', progress: 100,
      buckets: rows.length, activity_total: activityTotal, fetched: counts,
      finished_at: new Date().toISOString(),
      bucket_state: null, log_page: null, log_total_pages: null, log_range_start: null, phase: null,
    });
  } catch (e: any) {
    console.error('runSync fatal:', e);
    await updateStatus({
      status: 'error', stage: 'Erro', error: String(e?.message ?? e),
      finished_at: new Date().toISOString(),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!ACCESS_TOKEN || !SECRET_TOKEN) {
    return new Response(JSON.stringify({ error: 'GestãoClick tokens não configurados' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = {};
  try { body = await req.json(); } catch { /* sem body */ }
  const url = new URL(req.url);

  // Continuação de sync existente
  if (body?.continue === true) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runSync(supabase));
    return new Response(JSON.stringify({ ok: true, continued: true }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let data_inicio: string;
  let data_fim: string;
  if (body?.data_inicio && body?.data_fim) {
    data_inicio = String(body.data_inicio);
    data_fim = String(body.data_fim);
  } else {
    const daysRaw = Number(body?.days ?? url.searchParams.get('days') ?? '7');
    const days = Math.max(1, Math.min(daysRaw, 730));
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    data_inicio = fmt(start);
    data_fim = fmt(today);
  }

  // Verifica se já tem sync rodando E vivo (atualizado nos últimos 3 min)
  const { data: cur } = await supabase.from('gc_sync_status').select('*').eq('id', 'current').maybeSingle();
  if (cur?.status === 'running') {
    const updatedAt = cur.updated_at ? new Date(cur.updated_at).getTime() : 0;
    const ageMs = Date.now() - updatedAt;
    if (ageMs < 3 * 60 * 1000) {
      return new Response(JSON.stringify({ ok: true, already_running: true, status: cur }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // sync travado → segue para reiniciar
    console.log('Sync anterior travado, reiniciando');
  }

  // Inicializa novo sync
  await supabase.from('gc_sync_status').upsert({
    id: 'current',
    status: 'running',
    stage: 'Conectando...',
    progress: 2,
    data_inicio, data_fim,
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
    buckets: null,
    fetched: {},
    bucket_state: {},
    log_page: null,
    log_total_pages: null,
    log_range_start: null,
    phase: 'documents',
    activity_total: null,
    updated_at: new Date().toISOString(),
  });

  // @ts-ignore Deno EdgeRuntime global
  EdgeRuntime.waitUntil(runSync(supabase));

  return new Response(JSON.stringify({
    ok: true, started: true, range: { data_inicio, data_fim },
  }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
