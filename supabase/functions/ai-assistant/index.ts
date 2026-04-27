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

type RecentlyCompletedTask = {
  title: string;
  completedAt?: string | null;
  priority?: number;
  project?: string;
};

interface BasePayload {
  action: "suggest-slot" | "organize-day" | "analyze-day" | "chat";
  // Comum
  today: string; // YYYY-MM-DD
  targetDate?: string; // YYYY-MM-DD
  nowTime?: string; // HH:mm
  nowIso?: string;
  workdayStart?: string; // "07:00"
  workdayEnd?: string; // "20:00"
  scheduled?: ScheduledTask[]; // o que já está marcado
  holidays?: Holiday[];
  recentlyCompleted?: RecentlyCompletedTask[];
  userProfile?: {
    timezone?: string;
    workdayStart?: string;
    workdayEnd?: string;
    energyPattern?: string;
  };
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
  // Catálogo de tarefas com id (chat usa para tool calling com id real)
  taskCatalog?: { id: string; title: string; date?: string | null; time?: string | null; priority?: number; project?: string | null; completed?: boolean }[];
  // Projetos disponíveis (para create_task escolher projeto por nome)
  projectCatalog?: { id: string; name: string }[];
}

function toMinutes(time?: string | null) {
  const [h, m] = (time ?? "").slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function minimumTodayMinutes(p: BasePayload) {
  const now = toMinutes(p.nowTime);
  if (now === null) return null;
  return Math.ceil((now + 5) / 15) * 15;
}

function isPastForToday(date: string | undefined, time: string | undefined, p: BasePayload) {
  if (!date || !time || date !== p.today) return false;
  const min = minimumTodayMinutes(p);
  const slot = toMinutes(time);
  return min !== null && slot !== null && slot < min;
}

const BASE_PROMPT = `
Você é o assistente de produtividade do TaskFlow, app pessoal que sincroniza Todoist e Google Calendar.

IDIOMA: Português do Brasil. Direto, sem floreio, sem "claro!", sem "espero ter ajudado".

FUSO E DATA: O contexto sempre traz \`now\` em ISO com fuso America/Sao_Paulo. NUNCA invente data atual. NUNCA confunda "hoje" com \`targetDate\` — sempre use \`targetDate\` como dia alvo. Se forem diferentes, deixe explícito.

DADOS DISPONÍVEIS:
- tasks: {id, content, priority (1=baixa…4=urgente/P1), due, duration(min), labels, project}
- events: {id, title, start, end, calendar} — TODOS os bloqueios do Calendar (incluindo almoço, pausas, pessoais)
- holidays: feriados BR
- userProfile: {workStart, workEnd, focusBlocks, energyPattern}
- now, targetDate
- recentlyDone: tarefas concluídas nas últimas 48h

REGRAS DURAS:
1. NUNCA invente tarefa, evento, horário ou prazo que não esteja no contexto.
2. NUNCA proponha ação irreversível sem pedido explícito do usuário.
3. Qualquer item em \`events\` é bloqueio absoluto. Não há janela protegida hardcoded — se o usuário precisa proteger algo, está em events.
4. Prioridade: P1 (4) > P2 (3) > P3 (2) > P4 (1). Prazo vencendo desempata.
5. Sugestões fora de workStart–workEnd exigem confirmação explícita do usuário.
6. Toda recomendação tem justificativa curta baseada em dados (ex.: "P1 + bloco livre 09:30 + 30min").
7. Se faltar contexto, declare o que falta. Não chute.
8. Quando a action exigir tool calling, RESPONDA APENAS via tool, JSON válido, nada fora.
`;

const SYSTEM_ANALYZE = BASE_PROMPT + `
AÇÃO: analyze-day
OBJETIVO: Diagnóstico ACIONÁVEL do dia targetDate. Não é resumo descritivo — termina com decisão.

Use a tool \`return_analysis\` com:
- workloadScore (0–10)
- workloadLabel ("leve"|"equilibrado"|"apertado"|"sobrecarregado")
- topPriorities: até 3 {taskId, why(<=12 palavras)}
- conflicts: [{type,description,taskIds[]}], type ∈ {"overlap","noSlot","afterHours","holidayWork","p1WithoutTime"}
- risks: até 3 strings curtas
- recommendations: até 4 {action, rationale, taskIds?} — ações imperativas e concretas
- focusBlock: melhor janela contínua >=60min livre, {start,end,durationMin} ou null
- summary: 1 frase, MÁX 25 palavras, começando com o veredito

PROIBIDO: jargão vago tipo "carga equilibrada, dia produtivo!". Se está leve, diga o que fazer com a folga.
`;

const SYSTEM_ORGANIZE = BASE_PROMPT + `
AÇÃO: organize-day
OBJETIVO: Encaixar tarefas SEM horário do dia targetDate nos blocos livres reais.

ALGORITMO:
1. Liste blocos livres entre workStart–workEnd descontando TODOS os events (incluindo almoço).
2. Ordene tarefas por priority desc → due asc → duration asc.
3. Encaixe no primeiro bloco compatível. Sem duration, assuma 30min.
4. Tarefas com label "deep" ou priority=4 preferem focusBlocks.
5. Tarefas <=15min podem ser agrupadas (até 3 consecutivas).
6. Não estoure workEnd. Sobrou? Vai pra unscheduled com motivo.

Use a tool \`return_organize\` com:
- proposals: [{taskId, suggestedStart, suggestedEnd, rationale, confidence:"alta"|"media"|"baixa"}]
- unscheduled: [{taskId, reason}] — reasons ∈ {"semSlot","duracaoIncompativel","foraDoExpediente","conflitoFeriado"}
- summary: 1 frase
- requiresConfirmation: SEMPRE true

NUNCA aplique direto. NUNCA sobrescreva tarefa que já tem horário do usuário.
`;

const SYSTEM_SUGGEST = BASE_PROMPT + `
AÇÃO: suggest-slot
OBJETIVO: Dado candidate {title, durationMin?, priorityHint?}, sugerir o melhor {date,start,end}.

HEURÍSTICAS:
1. Inferir duration: call/reunião≈30, ler/revisar≈25, implementar/escrever≈90, default 30.
2. Inferir priority por palavras (urgente/hoje/prazo→4; lembrar/qualquer dia→2).
3. Buscar primeiro slot livre respeitando expediente, events e energyPattern.
4. Preferir HOJE se priority>=3 e há slot suficiente antes de workEnd. Senão, próximo dia útil.
5. Se title contém data/hora explícita ("amanhã 14h"), respeite literalmente.

Use a tool \`return_slot\` com:
- date: "YYYY-MM-DD" ou null
- start: "HH:mm"
- end: "HH:mm"
- durationMin: int
- inferredPriority: 1..4
- rationale: <=15 palavras
- alternatives: até 2 {date,start,end,rationale}

Se nenhum slot em 7 dias úteis, date=null com rationale.
`;

const SYSTEM_CHAT = BASE_PROMPT + `
AÇÃO: chat
OBJETIVO: Responder perguntas livres E EXECUTAR AÇÕES sobre a agenda/tarefas.

ESTILO:
- Texto natural, curto. Máx 4 frases por padrão.
- Listas: tabela markdown enxuta (até 5 linhas) ou bullets curtos.
- Ao citar tarefa: (P1/P2/P3/P4) e horário se houver.

VOCÊ TEM FERRAMENTAS (tool calling). USE-AS quando o usuário pedir AÇÃO:
- create_task: criar uma tarefa nova ("cria…", "adiciona…", "marca reunião…").
- update_task: editar tarefa existente ("move pra 14h", "muda prioridade", "renomeia").
- complete_task: marcar como concluída ("conclui…", "marca como feita…").
- delete_task: apagar ("apaga…", "remove…", "deleta…").

REGRAS DE FERRAMENTAS:
- Para update/complete/delete, OBRIGATÓRIO usar o id real da tarefa do contexto. Se não souber qual tarefa, NÃO chame ferramenta — pergunte qual.
- Você pode chamar VÁRIAS ferramentas na mesma resposta (ex.: criar 3 tarefas).
- Sempre escreva também uma resposta em texto explicando o que vai fazer (1-2 frases). O usuário vai CONFIRMAR antes de aplicar.
- Se for só pergunta ("quando tenho 1h livre?"), NÃO chame ferramenta — só responda em texto.
- NUNCA invente tarefa fora de \`tasks\` ao referenciar id.

PROIBIDO:
- Conselhos genéricos de produtividade ("acorde cedo", "use pomodoro"). Só falar dos DADOS DELE.
- Responder sobre dias fora do contexto sem avisar que não tem visibilidade.
`;

function buildContextBlock(p: BasePayload): string {
  const today = p.today;
  const targetDate = p.targetDate ?? p.date ?? p.today;
  const ws = p.userProfile?.workdayStart ?? p.workdayStart ?? "09:00";
  const we = p.userProfile?.workdayEnd ?? p.workdayEnd ?? "18:00";
  const sched = (p.scheduled ?? [])
    .slice(0, 120)
    .map(
      (t) =>
        `- ${t.date}${t.time ? ` ${t.time}` : ""} (${t.durationMinutes ?? 30}min) [P${t.priority ?? 4}] ${t.title}${
          t.project ? ` · ${t.project}` : ""
        }`,
    )
    .join("\n");
  const hol = (p.holidays ?? [])
    .slice(0, 30)
    .map((h) => `- ${h.date}: ${h.name}`)
    .join("\n");
  const completed = (p.recentlyCompleted ?? [])
    .slice(0, 30)
    .map((t) => `- ${t.completedAt ?? "?"} [P${t.priority ?? 4}] ${t.title}`)
    .join("\n");

  const catalog = (p.taskCatalog ?? [])
    .slice(0, 200)
    .map(
      (t) =>
        `- id=${t.id} | ${t.title}${t.date ? ` | ${t.date}${t.time ? ` ${t.time}` : ""}` : " | sem data"} | P${t.priority ?? 4}${t.project ? ` | ${t.project}` : ""}${t.completed ? " | ✓" : ""}`,
    )
    .join("\n");
  const projectsBlock = (p.projectCatalog ?? [])
    .slice(0, 50)
    .map((pr) => `- id=${pr.id} | ${pr.name}`)
    .join("\n");

  return [
    "CONTEXTO DO USUÁRIO:",
    `- now: ${p.nowIso ?? "?"} (${p.userProfile?.timezone ?? "America/Sao_Paulo"})`,
    `- today: ${today}`,
    `- targetDate: ${targetDate}`,
    `- workStart: ${ws} | workEnd: ${we}`,
    p.userProfile?.energyPattern ? `- energyPattern: ${p.userProfile.energyPattern}` : "",
    "",
    "TASKS + EVENTS DO PERÍODO (cada item já marcado é bloqueio absoluto — eventos do Google Calendar incluídos):",
    sched || "(vazio)",
    "",
    catalog ? "CATÁLOGO DE TAREFAS (use estes ids em tool calls):" : "",
    catalog,
    "",
    projectsBlock ? "PROJETOS DISPONÍVEIS:" : "",
    projectsBlock,
    "",
    "FERIADOS BR:",
    hol || "(nenhum no período)",
    "",
    "RECENTLY DONE (últimas 48h):",
    completed || "(nenhuma)",
  ]
    .filter(Boolean)
    .join("\n");
}

function systemFor(action: BasePayload["action"]): string {
  switch (action) {
    case "analyze-day":
      return SYSTEM_ANALYZE;
    case "organize-day":
      return SYSTEM_ORGANIZE;
    case "suggest-slot":
      return SYSTEM_SUGGEST;
    case "chat":
    default:
      return SYSTEM_CHAT;
  }
}

function buildSystemPrompt(p: BasePayload): string {
  return systemFor(p.action) + "\n\n" + buildContextBlock(p);
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
      if (parsed && isPastForToday(parsed.date, parsed.time, payload)) {
        const min = minimumTodayMinutes(payload)!;
        parsed.time = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
        parsed.reason = `Ajustei para não sugerir horário no passado. ${parsed.reason ?? ""}`.trim();
      }
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
      if (parsed?.assignments?.length) {
        const before = parsed.assignments.length;
        parsed.assignments = parsed.assignments.filter(
          (a: { date?: string; time?: string }) => !isPastForToday(a.date, a.time, payload),
        );
        if (parsed.assignments.length !== before) {
          parsed.summary = `${parsed.summary ?? "Plano gerado."} Removi horários que caíam no passado.`;
        }
      }
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
