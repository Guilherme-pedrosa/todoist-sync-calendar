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
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function gcFetch(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(params as any).toString();
  const url = `${GC_BASE}${path}?${qs}`;
  for (let attempt = 0; attempt < 4; attempt++) {
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
    await sleep(400); // respect 3 req/s
  }
}

function bkey(buckets: Map<string, Bucket>, day: string, uid: string, uname: string) {
  const k = `${day}|${uid}`;
  let b = buckets.get(k);
  if (!b) {
    b = {
      day, gc_user_id: uid, gc_user_name: uname || 'Sem nome',
      vendas_count: 0, vendas_valor: 0,
      os_count: 0, os_valor: 0,
      orcamentos_count: 0, orcamentos_valor: 0,
      nfs_count: 0, nfs_valor: 0,
      entrada_notas: 0, separacao_pecas: 0, entrega_pecas: 0,
      tratativa_incorreta: 0, cadastro_produto: 0, abertura_os: 0,
    };
    buckets.set(k, b);
  }
  return b;
}

function pickUser(row: any): { id: string; name: string } | null {
  if (row.vendedor_id) return { id: String(row.vendedor_id), name: row.nome_vendedor || '' };
  if (row.tecnico_id) return { id: String(row.tecnico_id), name: row.nome_tecnico || '' };
  if (row.usuario_id) return { id: String(row.usuario_id), name: row.nome_usuario || '' };
  return null;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!ACCESS_TOKEN || !SECRET_TOKEN) {
    return new Response(JSON.stringify({ error: 'GestãoClick tokens não configurados' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Aceita: { data_inicio, data_fim } OU { days } OU query ?days=N
  let body: any = {};
  try { body = await req.json(); } catch { /* sem body */ }
  const url = new URL(req.url);

  let data_inicio: string;
  let data_fim: string;
  if (body?.data_inicio && body?.data_fim) {
    data_inicio = String(body.data_inicio);
    data_fim = String(body.data_fim);
  } else {
    const daysRaw = Number(body?.days ?? url.searchParams.get('days') ?? '7');
    const days = Math.max(1, Math.min(daysRaw, 730)); // cap 2 anos
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    data_inicio = fmt(start);
    data_fim = fmt(today);
  }

  const buckets = new Map<string, Bucket>();

  const sources = [
    { path: '/vendas', kind: 'vendas' as const },
    { path: '/ordens_servicos', kind: 'os' as const },
    { path: '/orcamentos', kind: 'orcamentos' as const },
    { path: '/notas_fiscais_produtos', kind: 'nfs' as const },
    { path: '/notas_fiscais_consumidores', kind: 'nfs' as const },
    { path: '/notas_fiscais_servicos', kind: 'nfs' as const },
  ];

  const counts: Record<string, number> = {};

  for (const s of sources) {
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
    } catch (e) {
      console.error(`Falhou ${s.path}:`, e);
    }
    counts[s.path] = n;
  }

  // ===== Atividades operacionais via /logs =====
  // Mapa nome→id de usuários do GC pra unificar com vendedor/tecnico
  const nameToId = new Map<string, string>();
  try {
    for await (const u of paginate('/usuarios', {})) {
      const nome = String(u?.nome ?? '').trim();
      const id = String(u?.id ?? '').trim();
      if (nome && id) nameToId.set(nome.toLowerCase(), id);
    }
  } catch (e) {
    console.error('Falhou /usuarios:', e);
  }

  let logsN = 0;
  try {
    for await (const log of paginate('/logs', { data_inicio, data_fim })) {
      const day: string = String(log?.cadastrado_em ?? '').slice(0, 10);
      const nome = String(log?.nome_usuario ?? '').trim();
      if (!day || !nome) continue;
      const desc = String(log?.descricao ?? '');
      const mod = String(log?.modulo ?? '');
      const uid = nameToId.get(nome.toLowerCase()) ?? `nome:${nome}`;
      const b = bkey(buckets, day, uid, nome);

      if (mod === 'compras' && /para Finalizado/i.test(desc)) {
        b.entrada_notas++;
      } else if (mod === 'ordens_servicos' && /para PEDIDO CONFERIDO AGUARDANDO EXECU/i.test(desc)) {
        b.separacao_pecas++;
      } else if (mod === 'ordens_servicos' && /para RETIRADA PELO TECNICO/i.test(desc)) {
        b.entrega_pecas++;
      } else if (mod === 'ordens_servicos' && /para AG CORRE[CÇ]/i.test(desc) && /DEVOLVIDO PELO T[EÉ]CNICO/i.test(desc)) {
        b.tratativa_incorreta++;
      } else if (mod === 'produtos' && /^Adicionou o produto/i.test(desc)) {
        b.cadastro_produto++;
      } else if (mod === 'orcamentos' && /para Aprovado - OS Gerada/i.test(desc)) {
        b.abertura_os++;
      } else {
        continue;
      }
      logsN++;
    }
  } catch (e) {
    console.error('Falhou /logs:', e);
  }
  counts['/logs'] = logsN;

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
    const chunk = 500;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk).map(r => ({ ...r, computed_at: new Date().toISOString() }));
      const { error } = await supabase.from('gc_daily_activity').insert(slice);
      if (error) console.error('insert error', error);
    }
  }

  return new Response(JSON.stringify({
    ok: true, range: { data_inicio, data_fim }, fetched: counts, buckets: rows.length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
