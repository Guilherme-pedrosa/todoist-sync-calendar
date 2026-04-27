// Edge function: ai-assistant
// Centraliza chamadas ao Lovable AI (Gemini) com 4 ações:
//   - suggest-slot: sugere melhor data/horário para uma única tarefa
//   - organize-day: distribui várias tarefas sem horário em slots livres
//   - analyze-day: análise narrativa do dia (sobrecarga, conflitos, dicas)
//   - chat: conversa livre sobre a agenda (multi-turn)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

type ScheduledTask = {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:mm
  durationMinutes?: number | null;
  priority?: number;
  project?: string;
};

type UnscheduledTask = {
  id: string;
  title: string;
  durationMinutes?: number | null;
  priority?: number;
  project?: string;
};

type Holiday = { date: string; name: string; type: string };

interface BasePayload {
  action: "suggest-slot" | "organize-day" | "analyze-day" | "chat";
  // Comum
  today: string; // YYYY-MM-DD
  workdayStart?: string; // "07:00"
  workdayEnd?: string; // "20:00"
  scheduled?: ScheduledTask[]; // o que já está marcado
  holidays?: Holiday[];
  // suggest-slot
  task?: {
    title: string;
    description?: string;
    durationMinutes?: number;
    priority?: number;
    deadline?: string | null;
  };
  // organize-day
  date?: string; // dia alvo
  unscheduled?: UnscheduledTask[];
  // analyze-day
  // chat
  messages?: { role: "user" | "assistant"; content: string }[];
}

function buildSystemPrompt(p: BasePayload): string {
  const today = p.today;
  const ws = p.workdayStart ?? "08:00";
  const we = p.workdayEnd ?? "19:00";
  const sched = (p.scheduled ?? [])
    .slice(0, 80)
    .map(
      (t) =>
        `- ${t.date}${t.time ? ` ${t.time}` : ""} (${t.durationMinutes ?? 60}min) [P${t.priority ?? 4}] ${t.title}${
          t.project ? ` · ${t.project}` : ""
        }`,
    )
    .join("\n");
  const hol = (p.holidays ?? [])
    .slice(0, 30)
    .map((h) => `- ${h.date}: ${h.name} (${h.type})`)
    .join("\n");

  return [
    "Você é um assistente de produtividade integrado a um app de tarefas estilo Todoist com sincronização ao Google Calendar.",
    "Responda SEMPRE em português do Brasil, com tom direto, prático e amigável.",
    `Hoje é ${today}. Janela de trabalho padrão: ${ws}–${we}.`,
    "Princípios:",
    "- Respeite feriados nacionais (não agende trabalho neles, exceto se o usuário pedir).",
    "- Tarefas de alta prioridade (P1, P2) ficam na manhã, quando possível.",
    "- Deixe respiros de 10–15 min entre blocos longos.",
    "- Não sobreponha horários de tarefas já marcadas.",
    "- Use blocos arredondados em múltiplos de 15 minutos.",
    "",
    "AGENDA ATUAL:",
    sched || "(sem tarefas marcadas)",
    "",
    "FERIADOS:",
    hol || "(sem feriados no período)",
  ].join("\n");
}

async function callAI(body: Record<string, unknown>): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const r = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: DEFAULT_MODEL, ...body }),
  });
  if (r.status === 429) {
    return new Response(
      JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (r.status === 402) {
    return new Response(
      JSON.stringify({ error: "Créditos de IA esgotados. Adicione fundos em Configurações → Workspace → Uso." }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!r.ok) {
    const t = await r.text();
    console.error("AI gateway error", r.status, t);
    return new Response(
      JSON.stringify({ error: "Falha ao chamar a IA", detail: t }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = (await req.json()) as BasePayload;
    if (!payload?.action) {
      return new Response(JSON.stringify({ error: "action é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = buildSystemPrompt(payload);

    // ---------- suggest-slot ----------
    if (payload.action === "suggest-slot") {
      if (!payload.task?.title) {
        return new Response(JSON.stringify({ error: "task.title obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userMsg = [
        "Sugira o MELHOR horário para esta nova tarefa.",
        `Título: ${payload.task.title}`,
        payload.task.description ? `Descrição: ${payload.task.description}` : "",
        `Duração estimada: ${payload.task.durationMinutes ?? 60} min`,
        `Prioridade: P${payload.task.priority ?? 4}`,
        payload.task.deadline ? `Prazo final: ${payload.task.deadline}` : "",
        "Retorne via tool call.",
      ]
        .filter(Boolean)
        .join("\n");

      const aiResp = await callAI({
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_slot",
              description: "Retorna o melhor horário para a tarefa.",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string", description: "YYYY-MM-DD" },
                  time: { type: "string", description: "HH:mm (24h)" },
                  durationMinutes: { type: "number" },
                  reason: { type: "string", description: "Justificativa curta em PT-BR" },
                },
                required: ["date", "time", "durationMinutes", "reason"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_slot" } },
      });
      if (!aiResp.ok) return aiResp;
      const data = await aiResp.json();
      const args =
        data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : null;
      return new Response(JSON.stringify({ result: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- organize-day ----------
    if (payload.action === "organize-day") {
      const date = payload.date ?? payload.today;
      const userMsg = [
        `Distribua estas tarefas no dia ${date} em horários adequados, respeitando o que já está agendado.`,
        "Tarefas a posicionar:",
        ...(payload.unscheduled ?? []).map(
          (t) =>
            `- id=${t.id} | ${t.title} | dur=${t.durationMinutes ?? 60}min | P${t.priority ?? 4}${
              t.project ? ` | ${t.project}` : ""
            }`,
        ),
        "Retorne via tool call. Não mude o id.",
      ].join("\n");

      const aiResp = await callAI({
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "organize_day",
              description: "Atribui horário a cada tarefa.",
              parameters: {
                type: "object",
                properties: {
                  assignments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        date: { type: "string" },
                        time: { type: "string" },
                        durationMinutes: { type: "number" },
                      },
                      required: ["id", "date", "time", "durationMinutes"],
                      additionalProperties: false,
                    },
                  },
                  summary: { type: "string", description: "Resumo curto do plano em PT-BR" },
                },
                required: ["assignments", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "organize_day" } },
      });
      if (!aiResp.ok) return aiResp;
      const data = await aiResp.json();
      const args =
        data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : null;
      return new Response(JSON.stringify({ result: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- analyze-day ----------
    if (payload.action === "analyze-day") {
      const date = payload.date ?? payload.today;
      const userMsg = [
        `Analise o dia ${date}.`,
        "Avalie: carga de trabalho (leve/equilibrada/sobrecarregada), conflitos de horário,",
        "blocos sem respiro, distribuição de prioridades e oportunidades de melhoria.",
        "Responda em markdown curto com seções: 📊 Resumo, ⚠️ Pontos de atenção, ✅ Sugestões.",
      ].join("\n");

      const aiResp = await callAI({
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      });
      if (!aiResp.ok) return aiResp;
      const data = await aiResp.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      return new Response(JSON.stringify({ result: { text } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- chat ----------
    if (payload.action === "chat") {
      const messages = payload.messages ?? [];
      const aiResp = await callAI({
        messages: [
          { role: "system", content: system },
          ...messages,
        ],
      });
      if (!aiResp.ok) return aiResp;
      const data = await aiResp.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      return new Response(JSON.stringify({ result: { text } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-assistant error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
