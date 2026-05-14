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
        const sumKeys = ['orcamentos_count','orcamentos_valor','os_count','os_valor','vendas_count','vendas_valor','nfs_count','nfs_valor','abertura_compras','abertura_os','cadastro_produto','tratativa_incorreta','entrega_pecas','separacao_pecas','entrada_notas'];
        const tot: any = Object.fromEntries(sumKeys.map(k => [k, 0]));
        for (const r of matched) for (const k of sumKeys) tot[k] += Number(r[k] || 0);

        // Conta dias úteis (Seg-Sex) no período
        let businessDays = 0;
        const d0 = new Date(periodStart + 'T12:00:00Z');
        const d1 = new Date(periodEnd + 'T12:00:00Z');
        for (let d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
          const wd = d.getUTCDay();
          if (wd >= 1 && wd <= 5) businessDays++;
        }
        const bd = Math.max(1, businessDays);
        const avg = (n: number) => (n / bd).toFixed(1);
        const avgBRL = (n: number) => fmtBRL(n / bd);

        // Breakdown por dia (somando linhas do mesmo dia caso haja duplicidade de nome GC)
        const byDay = new Map<string, any>();
        for (const r of matched) {
          const cur = byDay.get(r.day) || Object.fromEntries(sumKeys.map(k => [k, 0]));
          for (const k of sumKeys) cur[k] += Number(r[k] || 0);
          byDay.set(r.day, cur);
        }
        const dayLines = [...byDay.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([day, v]) => `  ${day}: orçamentos ${v.orcamentos_count} (${fmtBRL(v.orcamentos_valor)}) | OS ${v.os_count} | vendas ${v.vendas_count} | NF ${v.nfs_count} | abertura OS ${v.abertura_os} | ped.compra ${v.abertura_compras} | entrada notas ${v.entrada_notas} | separação ${v.separacao_pecas} | entrega ${v.entrega_pecas} | OS incorreta ${v.tratativa_incorreta} | cad.produto ${v.cadastro_produto}`)
          .join('\n');

        const gcNames = [...new Set(matched.map((r: any) => r.gc_user_name))].join(', ');
        gcSummary = `

GESTÃOCLICK — usuário(s) GC casados por nome: ${gcNames}
Dias úteis no período: ${bd}

GLOSSÁRIO (importantíssimo, não confundir):
- "Orçamentos" = quantidade de orçamentos CRIADOS pelo colaborador (endpoint /orcamentos do ERP).
- "Abertura de OS" = orçamento que virou OS (evento de log "Aprovado - OS Gerada"). NÃO é o mesmo que "Orçamentos".
- "Pedido de compra" = abertura de pedido de compra (log).
- "OS incorreta" = tratativa de OS marcada como incorreta (log).
- Demais campos vêm do log operacional do ERP.

TOTAIS NO PERÍODO (e média/dia útil entre parênteses):
- Vendas: ${tot.vendas_count} (${avg(tot.vendas_count)}/dia) — ${fmtBRL(tot.vendas_valor)} (${avgBRL(tot.vendas_valor)}/dia)
- OS: ${tot.os_count} (${avg(tot.os_count)}/dia) — ${fmtBRL(tot.os_valor)} (${avgBRL(tot.os_valor)}/dia)
- Orçamentos (criados): ${tot.orcamentos_count} (${avg(tot.orcamentos_count)}/dia) — ${fmtBRL(tot.orcamentos_valor)} (${avgBRL(tot.orcamentos_valor)}/dia)
- Notas Fiscais: ${tot.nfs_count} (${avg(tot.nfs_count)}/dia) — ${fmtBRL(tot.nfs_valor)} (${avgBRL(tot.nfs_valor)}/dia)
- Abertura de OS (orçamento → OS): ${tot.abertura_os} (${avg(tot.abertura_os)}/dia)
- Pedido de compra: ${tot.abertura_compras} (${avg(tot.abertura_compras)}/dia)
- Entrada de notas: ${tot.entrada_notas} (${avg(tot.entrada_notas)}/dia)
- Separação de peças: ${tot.separacao_pecas} (${avg(tot.separacao_pecas)}/dia)
- Entrega de peças: ${tot.entrega_pecas} (${avg(tot.entrega_pecas)}/dia)
- OS incorreta: ${tot.tratativa_incorreta} (${avg(tot.tratativa_incorreta)}/dia)
- Cadastro de produto: ${tot.cadastro_produto} (${avg(tot.cadastro_produto)}/dia)

QUEBRA POR DIA:
${dayLines}`;
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
${topDomains.map(d => `- ${d.domain}: ${fmtH(d.seconds)} (${d.category})`).join('\n')}${gcSummary}

Gere análise em JSON conforme schema do system prompt. Considere a atividade no GestãoClick (se houver) ao avaliar produtividade real — tempo de tela é proxy, mas entregas no ERP são output concreto.`;

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
