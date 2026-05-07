import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

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

  const providedSecret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('PRODUCTIVITY_CRON_SECRET');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'forbidden' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const targetWorkspaceId = body.workspace_id;
    const periodDays = Math.max(1, Math.min(30, body.period_days || 7));

    const periodEnd = new Date().toISOString().slice(0, 10);
    const periodStartDate = new Date();
    periodStartDate.setDate(periodStartDate.getDate() - periodDays + 1);
    const periodStart = periodStartDate.toISOString().slice(0, 10);

    let query = supabase
      .from('daily_activity_stats')
      .select('user_id, workspace_id')
      .gte('day', periodStart)
      .lte('day', periodEnd);
    if (targetWorkspaceId) query = query.eq('workspace_id', targetWorkspaceId);
    const { data: activeUsers } = await query;

    const uniqueUsers = new Map<string, true>();
    for (const r of (activeUsers || [])) {
      uniqueUsers.set(`${r.user_id}|${r.workspace_id}`, true);
    }

    let generated = 0;
    const errors: string[] = [];

    for (const [key] of uniqueUsers) {
      const [userId, workspaceId] = key.split('|');

      try {
        const { data: stats } = await supabase
          .from('daily_activity_stats')
          .select('*')
          .eq('user_id', userId)
          .eq('workspace_id', workspaceId)
          .gte('day', periodStart)
          .lte('day', periodEnd);

        if (!stats || stats.length === 0) continue;

        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', userId)
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

        const userMessage = `Colaborador: ${nome}
Período: ${periodStart} a ${periodEnd} (${periodDays} dias)

MÉTRICAS:
- Tempo online: ${fmtH(totalOnline)}
- Tempo ativo: ${fmtH(totalAtivo)} (${totalOnline > 0 ? Math.round(100 * totalAtivo / totalOnline) : 0}%)
- Tempo idle: ${fmtH(totalIdle)}
- Sites produtivos: ${fmtH(totalProd)}
- Sites neutros: ${fmtH(totalNeutro)}
- Sites improdutivos: ${fmtH(totalDist)}
- Tarefas concluídas: ${totalTasks}

TOP DOMÍNIOS:
${topDomains.map(d => `- ${d.domain}: ${fmtH(d.seconds)} (${d.category})`).join('\n')}`;

        const aiRes = await fetch(AI_GATEWAY_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
          }),
        });

        if (!aiRes.ok) throw new Error(`AI ${aiRes.status}`);
        const aiData = await aiRes.json();
        const insight = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');

        await supabase
          .from('productivity_insights')
          .upsert({
            user_id: userId,
            workspace_id: workspaceId,
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
            generated_by: MODEL,
            generated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,workspace_id,period_start,period_end' });

        generated++;
      } catch (e: any) {
        errors.push(`${userId}: ${e.message || String(e)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, generated, total: uniqueUsers.size, errors: errors.slice(0, 5) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[productivity-insights-cron] fatal', e);
    return new Response(JSON.stringify({ error: e.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
