// Fetches "A Fazer" count from Auvo GC Sync's budget-kanban and returns
// aggregated counts per técnico. Used by the per-user Dashboard.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const AUVO_URL = Deno.env.get('AUVO_SUPABASE_URL')!;
const AUVO_ANON = Deno.env.get('AUVO_SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Wide window = "tudo em aberto"
    const end = new Date().toISOString().slice(0, 10);
    const start = '2020-01-01';

    const resp = await fetch(`${AUVO_URL}/functions/v1/budget-kanban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUVO_ANON}`,
        apikey: AUVO_ANON,
      },
      body: JSON.stringify({ mode: 'cache', start_date: start, end_date: end }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return new Response(
        JSON.stringify({ error: 'auvo_fetch_failed', status: resp.status, details: body }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const data = await resp.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];

    const hasFilled = (item: any) =>
      Array.isArray(item.questionario_respostas) &&
      item.questionario_respostas.some(
        (r: any) => r.reply && String(r.reply).trim() !== '' && !String(r.reply).startsWith('http'),
      );

    const systemColumn = (item: any): string => {
      if (item.os_realizada) return 'os_realizada';
      if (item.orcamento_realizado) return 'orc';
      if (!hasFilled(item)) return 'falta_preenchimento';
      return 'a_fazer';
    };

    const totals: Record<string, number> = {};
    let total = 0;
    for (const it of items) {
      const savedCol = it._coluna as string | undefined;
      // Prefer saved manual column when it's non-system; else recompute.
      const isManualSaved =
        savedCol &&
        savedCol !== 'a_fazer' &&
        savedCol !== 'falta_preenchimento' &&
        savedCol !== 'os_realizada' &&
        !savedCol.startsWith('orc_') &&
        savedCol !== 'orc';
      const col = isManualSaved ? savedCol! : systemColumn(it);
      if (col === 'a_fazer') {
        const t = String(it.tecnico || '').trim() || '(sem técnico)';
        totals[t] = (totals[t] || 0) + 1;
        total++;
      }
    }

    return new Response(
      JSON.stringify({
        total,
        totals,
        tecnicos: Object.keys(totals).sort(),
        updatedAt: data?.ultimo_sync ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'unexpected', message: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
