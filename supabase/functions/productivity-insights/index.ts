import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const SYSTEM_PROMPT = `Você é um analista de produtividade da empresa WeDo (assistência técnica de cozinhas profissionais).

Analise os dados do colaborador no período e gere um resumo em PT-BR direto, técnico e prático. Sem floreio. Sem corporativês.

Contexto WeDo:
- Operação core: assistência técnica multimarcas, manutenção PCM, contratos.
- Ferramentas oficiais: GestãoClick (ERP), Auvo (field service), TaskFlow (gestão).
- Domínios produtivos: gestaoclick, auvo, taskflow, supabase, lovable, github.

Estilo: direto, técnico, sem rodeio, foco em ação prática.

Responda APENAS em JSON válido:
{
  "summary": "Parágrafo único, max 80 palavras, PT-BR direto.",
  "highlights": [
    {"text": "...", "metric": "ex: 5h32m em GestãoClick"}
  ],
  "concerns": [
    {"text": "...", "severity": "low|medium|high"}
  ],
  "suggestions": [
    {"text": "...", "category": "process|tool|behavior|management"}
  ]
}

Limite: máximo 3 itens em cada array.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

  if (!lovableApiKey) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const userJwt = authHeader.replace('Bearer ', '');
  const { data: userData } = await supabase.auth.getUser(userJwt);
  const requesterId = userData?.user?.id;

  if (!requesterId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id;
    const targetWorkspaceId = body.workspace_id;
    const periodDays = Math.max(1, Math.min(30, body.period_days || 7));
    const forceModel = body.force_model === 'pro' ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';

    if (!targetUserId || !targetWorkspaceId) {
      return new Response(JSON.stringify({ error: 'user_id and workspace_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: isAdminData } = await supabase.rpc('is_productivity_admin', { _user_id: requesterId });
    const isAdmin = !!isAdminData;
    const isOwner = requesterId === targetUserId;

    if (!isAdmin && !isOwner) {
      return new Response(JSON.stringify({ error: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const periodEnd = new Date().toISOString().slice(0, 10);
    const periodStartDate = new Date();
    periodStartDate.setDate(periodStartDate.getDate() - periodDays + 1);
    const periodStart = periodStartDate.toISOString().slice(0, 10);

    const { data: stats } = await supabase
      .from('daily_activity_stats')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('workspace_id', targetWorkspaceId)
      .gte('day', periodStart)
      .lte('day', periodEnd)
      .order('day', { ascending: false });

    if (!stats || stats.length === 0) {
      return new Response(JSON.stringify({ error: 'no_data', message: 'Sem dados no período.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const nome = profile?.display_name || profile?.email?.split('@')[0] || 'Colaborador';

    const totalOnline = stats.reduce((s: number, r: any) => s + (r.online_seconds || 0), 0);
    const totalAtivo = stats.reduce((s: number, r: any) => s + (r.active_seconds || 0), 0);
    const totalIdle = stats.reduce((s: number, r: any) => s + (r.idle_seconds || 0), 0);
    const totalProd = stats.reduce((s: number, r: any) => s + (r.productive_seconds || 0), 0);
    const totalNeutro = stats.reduce((s: number, r: any) => s + (r.neutral_seconds || 0), 0);
    const totalDist = stats.reduce((s: number, r: any) => s + (r.distracting_seconds || 0), 0);
    const totalTasks = stats.reduce((s: number, r: any) => s + (r.tasks_completed || 0), 0);

    const domainMap = new Map<string, { seconds: number; category: string }>();
    for (const r of stats) {
      for (const d of (r.top_domains || [])) {
        const cur = domainMap.get(d.domain) || { seconds: 0, category: d.category };
        cur.seconds += d.seconds;
        domainMap.set(d.domain, cur);
      }
    }
    const topDomains = [...domainMap.entries()]
      .map(([domain, v]) => ({ domain, ...v }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 8);

    const fmtH = (s: number) => `${(s / 3600).toFixed(1)}h`;
    const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Buscar atividade GestãoClick correspondente ao colaborador (match por nome).
    const norm = (s: string) => (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const profileTokens = norm(nome);
    let gcSummary = '';
    if (profileTokens.length > 0) {
      const { data: gcRows } = await supabase
        .from('gc_daily_activity')
        .select('*')
        .gte('day', periodStart)
        .lte('day', periodEnd);
      const matched = (gcRows || []).filter((r: any) => {
        const tokens = norm(r.gc_user_name);
        // exige pelo menos 2 tokens em comum (ou 1 se o nome só tem 1 token)
        const need = Math.min(2, profileTokens.length);
        const hits = profileTokens.filter(t => tokens.includes(t)).length;
        return hits >= need;
      });
      if (matched.length > 0) {
        const tot = matched.reduce((acc: any, r: any) => {
          acc.orc_count += r.orcamentos_count || 0;
          acc.orc_valor += Number(r.orcamentos_valor || 0);
          acc.os_count += r.os_count || 0;
          acc.os_valor += Number(r.os_valor || 0);
          acc.vendas_count += r.vendas_count || 0;
          acc.vendas_valor += Number(r.vendas_valor || 0);
          acc.nfs_count += r.nfs_count || 0;
          acc.nfs_valor += Number(r.nfs_valor || 0);
          acc.abertura_compras += r.abertura_compras || 0;
          acc.abertura_os += r.abertura_os || 0;
          acc.cadastro_produto += r.cadastro_produto || 0;
          acc.tratativa_incorreta += r.tratativa_incorreta || 0;
          acc.entrega_pecas += r.entrega_pecas || 0;
          acc.separacao_pecas += r.separacao_pecas || 0;
          acc.entrada_notas += r.entrada_notas || 0;
          return acc;
        }, { orc_count:0, orc_valor:0, os_count:0, os_valor:0, vendas_count:0, vendas_valor:0, nfs_count:0, nfs_valor:0, abertura_compras:0, abertura_os:0, cadastro_produto:0, tratativa_incorreta:0, entrega_pecas:0, separacao_pecas:0, entrada_notas:0 });
        const gcNames = [...new Set(matched.map((r: any) => r.gc_user_name))].join(', ');
        gcSummary = `

GESTÃOCLICK (usuário(s) GC: ${gcNames}):
- Orçamentos: ${tot.orc_count} (${fmtBRL(tot.orc_valor)})
- OS: ${tot.os_count} (${fmtBRL(tot.os_valor)})
- Vendas: ${tot.vendas_count} (${fmtBRL(tot.vendas_valor)})
- NFs emitidas: ${tot.nfs_count} (${fmtBRL(tot.nfs_valor)})
- Aberturas de compras: ${tot.abertura_compras}
- Aberturas de OS: ${tot.abertura_os}
- Cadastro de produto: ${tot.cadastro_produto}
- Tratativas incorretas: ${tot.tratativa_incorreta}
- Entrega de peças: ${tot.entrega_pecas}
- Separação de peças: ${tot.separacao_pecas}
- Entrada de notas: ${tot.entrada_notas}`;
      } else {
        gcSummary = `

GESTÃOCLICK: sem atividade encontrada para este colaborador no período.`;
      }
    }

    const userMessage = `Colaborador: ${nome}
Período: ${periodStart} a ${periodEnd} (${periodDays} dias)

MÉTRICAS:
- Tempo online: ${fmtH(totalOnline)}
- Tempo ativo: ${fmtH(totalAtivo)} (${totalOnline > 0 ? Math.round(100 * totalAtivo / totalOnline) : 0}% do online)
- Tempo idle: ${fmtH(totalIdle)}
- Tempo em sites produtivos: ${fmtH(totalProd)}
- Tempo em sites neutros: ${fmtH(totalNeutro)}
- Tempo em sites improdutivos: ${fmtH(totalDist)}
- Tarefas concluídas: ${totalTasks}

TOP DOMÍNIOS:
${topDomains.map(d => `- ${d.domain}: ${fmtH(d.seconds)} (${d.category})`).join('\n')}

Gere análise em JSON conforme schema do system prompt.`;

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: forceModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      throw new Error(`AI Gateway ${aiRes.status}: ${errText.slice(0, 200)}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    const insight = JSON.parse(content);

    const { data: saved, error: saveErr } = await supabase
      .from('productivity_insights')
      .upsert({
        user_id: targetUserId,
        workspace_id: targetWorkspaceId,
        period_start: periodStart,
        period_end: periodEnd,
        summary: insight.summary || '',
        highlights: insight.highlights || [],
        concerns: insight.concerns || [],
        suggestions: insight.suggestions || [],
        raw_metrics: {
          online_seconds: totalOnline,
          active_seconds: totalAtivo,
          idle_seconds: totalIdle,
          productive_seconds: totalProd,
          neutral_seconds: totalNeutro,
          distracting_seconds: totalDist,
          tasks_completed: totalTasks,
          top_domains: topDomains,
        },
        generated_by: forceModel,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,workspace_id,period_start,period_end' })
      .select()
      .single();

    if (saveErr) throw saveErr;

    return new Response(JSON.stringify({ ok: true, insight: saved }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[productivity-insights] error', e);
    return new Response(JSON.stringify({ error: e.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
