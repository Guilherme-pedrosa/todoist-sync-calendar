import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';
const BATCH_SIZE = 20;

interface Classification {
  domain: string;
  category: 'productive' | 'neutral' | 'distracting';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

const SYSTEM_PROMPT = `Você é um classificador de produtividade no trabalho corporativo brasileiro.

Classifique cada domínio recebido em uma de três categorias:
- "productive": ferramenta de trabalho/produção (ERP, dev tools, comunicação corporativa, docs, fabricantes/fornecedores, e-commerce B2B, sistemas operacionais corporativos).
- "neutral": uso ambíguo (busca genérica, mapas, consulta pontual, traduções, tutoriais técnicos curtos, sites institucionais).
- "distracting": entretenimento puro, redes sociais pessoais, streaming de vídeo/música, jogos, compras pessoais, notícias/fofoca, conteúdo adulto.

Contexto: empresa WeDo de assistência técnica em cozinhas profissionais.
Ferramentas oficiais já cadastradas: GestãoClick, Auvo, TaskFlow, Supabase, GitHub, Lovable, Rational.

Confidence:
- "high": domínio claramente conhecido (ex: youtube.com, instagram.com, github.com).
- "medium": domínio plausível mas não 100% certo (ex: subdomínio incomum de empresa conhecida).
- "low": domínio obscuro/desconhecido — chute educado.

Responda APENAS em JSON válido, sem texto antes ou depois:
{
  "classifications": [
    {"domain": "...", "category": "...", "confidence": "...", "reasoning": "max 80 chars em PT-BR"}
  ]
}`;

async function classifyBatch(domains: string[], apiKey: string): Promise<Classification[]> {
  const userMessage = `Classifique os seguintes domínios:\n${domains.map(d => `- ${d}`).join('\n')}`;

  const res = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI Gateway error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);
  const list = parsed.classifications || [];

  return list.filter((c: any) =>
    c &&
    typeof c.domain === 'string' &&
    ['productive', 'neutral', 'distracting'].includes(c.category) &&
    ['low', 'medium', 'high'].includes(c.confidence)
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

  if (!lovableApiKey) {
    return new Response(
      JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const explicitDomains: string[] = Array.isArray(body.domains) ? body.domains : [];

    let domainsToClassify: string[];

    if (explicitDomains.length > 0) {
      domainsToClassify = [...new Set(explicitDomains.map(d => d.toLowerCase().trim()))].filter(Boolean);
    } else {
      const { data: visited, error: visitedErr } = await supabase
        .from('activity_url_visits')
        .select('domain')
        .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(5000);

      if (visitedErr) throw visitedErr;

      const allDomains = [...new Set((visited || []).map((v: any) => v.domain).filter(Boolean))];

      const { data: alreadyClassified } = await supabase
        .from('domain_classifications')
        .select('domain')
        .in('domain', allDomains);
      const classifiedSet = new Set((alreadyClassified || []).map((d: any) => d.domain));

      const { data: alreadyCategorized } = await supabase
        .from('domain_categories')
        .select('domain')
        .in('domain', allDomains);
      const categorizedSet = new Set((alreadyCategorized || []).map((d: any) => d.domain));

      domainsToClassify = allDomains.filter(
        d => !classifiedSet.has(d) && !categorizedSet.has(d)
      );
    }

    if (domainsToClassify.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, classified: 0, skipped: 0, message: 'No new domains' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let classifiedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < domainsToClassify.length; i += BATCH_SIZE) {
      const batch = domainsToClassify.slice(i, i + BATCH_SIZE);
      try {
        const results = await classifyBatch(batch, lovableApiKey);

        if (results.length === 0) {
          skippedCount += batch.length;
          continue;
        }

        const rows = results.map(c => ({
          domain: c.domain.toLowerCase().trim(),
          category: c.category,
          confidence: c.confidence,
          reasoning: (c.reasoning || '').slice(0, 200),
          classified_by: MODEL,
        }));

        const { error: upsertErr } = await supabase
          .from('domain_classifications')
          .upsert(rows, { onConflict: 'domain' });

        if (upsertErr) {
          errors.push(`Batch ${i}: ${upsertErr.message}`);
          skippedCount += batch.length;
        } else {
          classifiedCount += results.length;
          skippedCount += batch.length - results.length;
        }
      } catch (e: any) {
        errors.push(`Batch ${i}: ${e.message || String(e)}`);
        skippedCount += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        classified: classifiedCount,
        skipped: skippedCount,
        total: domainsToClassify.length,
        errors: errors.slice(0, 5),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[classify-domain] fatal error', e);
    return new Response(
      JSON.stringify({ error: e.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
