// Edge function: ai-assistant
// 4 ações: suggest-slot | organize-day | analyze-day | chat
// Modelo: Lovable AI Gateway (Gemini 3 Flash Preview)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

type ScheduledTask = {
  id?: string;
  title: string;
  date: string;
  time?: string | null;
  durationMinutes?: number | null;
  priority?: number;
  project?: string;
  labels?: string[];
};

type CalendarEvent = {
  id?: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  calendar?: string;
};

type UnscheduledTask = {
  id: string;
  title: string;
  durationMinutes?: number | null;
  priority?: number;
  project?: string;
  labels?: string[];
  deadline?: string | null;
};

type Holiday = { date: string; name: string; type: string };

type UserProfile = {
  workStart?: string;   // "09:00"
  workEnd?: string;     // "19:00"
  focusBlocks?: string[]; // ["09:00-11:00","15:00-16:30"]
  energyPattern?: "manha" | "tarde" | "noite";
  timezone?: string;    // "America/Sao_Paulo"
};

interface BasePayload {
  action: "suggest-slot" | "organize-day" | "analyze-day" | "chat";
  today: string;          // YYYY-MM-DD (no fuso BR)
  nowIso?: string;        // ISO com offset, ex: 2026-04-27T18:30:00-03:00
  nowTime?: string;       // HH:mm
  targetDate?: string;    // YYYY-MM-DD — separado de today
  userProfile?: UserProfile;
  scheduled?: ScheduledTask[];
  events?: CalendarEvent[];
  holidays?: Holiday[];
  recentlyCompleted?: { title: string; completedAt: string; priority?: number }[];
  // suggest-slot
  task?: {
    title: string;
    description?: string;
    durationMinutes?: number;
    priority?: number;
    deadline?: string | null;
  };
  // organize-day
  date?: string; // dia alvo (legado, equivale a targetDate)
  unscheduled?: UnscheduledTask[];
  // chat
  messages?: { role: "user" | "assistant"; content: string }[];
}

function fmtScheduled(list: ScheduledTask[] = []): string {
  if (!list.length) return "(sem tarefas marcadas)";
  return list
    .slice(0, 100)
    .map(
      (t) =>
        `- ${t.date}${t.time ? ` ${t.time}` : ""} (${t.durationMinutes ?? 30}min) [P${t.priority ?? 4}] ${t.title}${
          t.project ? ` · ${t.project}` : ""
        }${t.labels?.length ? ` #${t.labels.join(" #")}` : ""}`,
    )
    .join("\n");
}

function fmtEvents(list: CalendarEvent[] = []): string {
  if (!list.length) return "(sem eventos no Google Calendar)";
  return list
    .slice(0, 100)
    .map((e) => `- ${e.start} → ${e.end} | ${e.title}${e.calendar ? ` (${e.calendar})` : ""}`)
    .join("\n");
}

function fmtHolidays(list: Holiday[] = []): string {
  if (!list.length) return "(sem feriados no período)";
  return list.slice(0, 30).map((h) => `- ${h.date}: ${h.name} (${h.type})`).join("\n");
}

function fmtUnscheduled(list: UnscheduledTask[] = []): string {
  if (!list.length) return "(nenhuma)";
  return list
    .map(
      (t) =>
        `- id=${t.id} | ${t.title} | dur=${t.durationMinutes ?? 30}min | P${t.priority ?? 4}${
          t.project ? ` | ${t.project}` : ""
        }${t.labels?.length ? ` | #${t.labels.join(" #")}` : ""}${
          t.deadline ? ` | prazo=${t.deadline}` : ""
        }`,
    )
    .join("\n");
}

function fmtCompleted(list: BasePayload["recentlyCompleted"] = []): string {
  if (!list?.length) return "(nenhuma nas últimas 48h)";
  return list.slice(0, 30).map((t) => `- ${t.completedAt} [P${t.priority ?? 4}] ${t.title}`).join("\n");
}

function fmtFocus(p?: UserProfile): string {
  if (!p) return "(não definido)";
  const fb = p.focusBlocks?.length ? p.focusBlocks.join(", ") : "—";
  return `workStart=${p.workStart ?? "?"}, workEnd=${p.workEnd ?? "?"}, focusBlocks=[${fb}], energyPattern=${p.energyPattern ?? "—"}`;
}

// ===================== PROMPTS =====================

function basePrompt(p: BasePayload): string {
  const targetDate = p.targetDate ?? p.date ?? p.today;
  return [
    "Você é o assistente de produtividade do TaskFlow, um app pessoal de gestão de tempo que sincroniza Todoist e Google Calendar do usuário.",
    "",
    "IDIOMA: Sempre português do Brasil. Direto, sem floreio, sem \"claro!\", sem \"espero ter ajudado\".",
    "",
    `FUSO E DATA: now=${p.nowIso ?? `${p.today}T${p.nowTime ?? "00:00"}-03:00`} (America/Sao_Paulo). today=${p.today}. targetDate=${targetDate}.`,
    "NUNCA invente a data atual. NUNCA confunda \"hoje\" com a data alvo da análise — use sempre o campo `targetDate` do input. Se eles divergirem, deixe explícito qual está usando.",
    "",
    "DADOS DISPONÍVEIS NO CONTEXTO:",
    "- tasks (scheduled): tarefas Todoist já com data {title, date, time, durationMinutes, priority (1=P4 baixa…4=P1 urgente), project, labels}",
    "- events: eventos do Google Calendar com {title, start, end, calendar}",
    "- holidays: feriados nacionais BR",
    "- userProfile: {workStart, workEnd, focusBlocks, energyPattern}",
    "- recentlyCompleted: tarefas concluídas nas últimas 48h",
    "",
    "REGRAS DURAS:",
    "1. NUNCA invente tarefa, horário ou prazo que não esteja no contexto.",
    "2. NUNCA proponha ação irreversível (deletar, concluir em massa) sem que o usuário peça explicitamente.",
    "3. Sempre que sugerir horário, respeite: feriados, TODOS os eventos do `events` (incluindo almoço, pausas, compromissos pessoais — qualquer item do Calendar é bloqueio absoluto), janela de trabalho do usuário e blocos de foco. Conflito = não agendar.",
    "4. Tarefas P1 (priority=4) vêm primeiro; P2 depois; P3/P4 só se houver folga.",
    "5. Não há horário \"protegido\" hardcoded. Se o usuário precisa proteger almoço, pausa ou qualquer janela, isso DEVE estar como evento no Calendar — você só consulta `events`. Se uma janela aparenta \"vazia\" no contexto, ela está livre, ponto.",
    "6. Sugestões fora de `userProfile.workStart`–`userProfile.workEnd` exigem confirmação explícita do usuário.",
    "7. Toda sugestão precisa de justificativa curta baseada nos dados (ex.: \"P1 + prazo hoje + bloco livre 09:30\").",
    "8. Se o contexto estiver incompleto ou ambíguo, diga o que falta — não chute.",
    "9. Resposta SEMPRE em JSON válido conforme o schema da tool. Nada de texto fora do JSON quando a action exigir tool calling.",
    "10. Se targetDate for HOJE, NUNCA sugira horário < nowTime + 5min (arredondado a múltiplo de 15).",
    "",
    `USER PROFILE: ${fmtFocus(p.userProfile)}`,
    "",
    "AGENDA (tarefas com horário):",
    fmtScheduled(p.scheduled),
    "",
    "EVENTOS (Google Calendar — bloqueios absolutos):",
    fmtEvents(p.events),
    "",
    "FERIADOS:",
    fmtHolidays(p.holidays),
    "",
    "CONCLUÍDAS (últimas 48h):",
    fmtCompleted(p.recentlyCompleted),
  ].join("\n");
}

function analyzePrompt(p: BasePayload): string {
  return [
    basePrompt(p),
    "",
    "AÇÃO: analyze-day",
    "OBJETIVO: Diagnóstico acionável do dia `targetDate`. Não é resumo descritivo — é um raio-X que termina com decisão.",
    "",
    "ESTRUTURA DA RESPOSTA (campos da tool):",
    "- workloadScore: 0–10 (0 = vazio, 10 = sobrecarregado)",
    "- workloadLabel: \"leve\" | \"equilibrado\" | \"apertado\" | \"sobrecarregado\"",
    "- topPriorities: até 3 tarefas críticas {taskId, why} — \"why\" em até 12 palavras",
    "- conflicts: lista de {type, description, taskIds[]} — tipos: \"overlap\", \"noSlot\", \"afterHours\", \"holidayWork\", \"p1WithoutTime\"",
    "- risks: até 3 riscos curtos (ex.: \"3 tarefas P1 sem horário definido\")",
    "- recommendations: até 4 ações imperativas {action, rationale, taskIds?}",
    "  Ex.: \"Mover X para amanhã 09:00\", \"Bloquear 14:00–15:30 para foco em Y\", \"Adiar Z para sexta\".",
    "- focusBlock: melhor janela contínua >=60min livre {start, end, durationMin} ou null",
    "- summary: 1 frase, MÁX 25 palavras, começando com o veredito.",
    "",
    "PROIBIDO: jargão vago tipo \"carga equilibrada, bom dia produtivo!\". Se o dia está leve, diga o que fazer com a folga.",
  ].join("\n");
}

function organizePrompt(p: BasePayload): string {
  return [
    basePrompt(p),
    "",
    "AÇÃO: organize-day",
    "OBJETIVO: Pegar tarefas do dia `targetDate` SEM horário e propor cronograma encaixado nos blocos livres.",
    "",
    "ALGORITMO MENTAL:",
    "1. Liste blocos livres entre workStart e workEnd, descontando TODOS os items de `events` (almoço, reuniões, compromissos — qualquer evento do Calendar). Não assuma janela de almoço fixa.",
    "2. Ordene tarefas a alocar por: priority desc → prazo asc → duration asc.",
    "3. Encaixe cada tarefa no primeiro bloco compatível com sua duration. Sem duration → assuma 30min.",
    "4. Tarefas de alta concentração (label \"deep\" ou priority=4) vão preferencialmente nos focusBlocks do energyPattern.",
    "5. Tarefas rápidas (<=15min) podem ser agrupadas num batch de até 3 itens consecutivos.",
    "6. Não estoure workEnd. Sobrou tarefa → devolva em `unscheduled` com motivo.",
    "",
    "ESTRUTURA DA RESPOSTA:",
    "- assignments (proposals): lista ordenada {id, date, time, durationMinutes, rationale, confidence: \"alta\"|\"media\"|\"baixa\"}",
    "- unscheduledOut: lista {id, reason} — motivos válidos: \"semSlot\", \"duracaoIncompativel\", \"foraDoExpediente\", \"conflitoFeriado\"",
    "- summary: 1 frase resumindo (ex.: \"5 de 7 tarefas alocadas; 2 P3 ficaram para amanhã por falta de slot.\")",
    "- requiresConfirmation: SEMPRE true.",
    "",
    "NUNCA aplique direto. NUNCA sobrescreva tarefa que já tem horário definido pelo usuário.",
  ].join("\n");
}

function suggestPrompt(p: BasePayload): string {
  return [
    basePrompt(p),
    "",
    "AÇÃO: suggest-slot",
    "OBJETIVO: Dado um título de tarefa novo (e opcionalmente duration estimada e priority), sugerir o melhor {date, start, end}.",
    "",
    "HEURÍSTICA:",
    "1. Inferir duration pelo título se não vier (chamada/call ≈ 30min, \"revisar\"/\"ler\" ≈ 25min, \"implementar\"/\"escrever\" ≈ 90min, default 30min).",
    "2. Inferir priority por palavras (urgente, hoje, prazo → P1; lembrar, qualquer dia → P3).",
    "3. Buscar primeiro slot livre que respeite expediente, eventos do Calendar e energyPattern.",
    "4. Preferir HOJE se priority>=P2 e ainda houver slot >=duration antes de workEnd. Caso contrário, próximo dia útil.",
    "5. Se o título contiver data/hora explícita (\"amanhã 14h\", \"sexta de manhã\"), respeitar literalmente.",
    "",
    "Se NENHUM slot existir nos próximos 7 dias úteis, retornar date=\"\" e reason explicando.",
  ].join("\n");
}

function chatPrompt(p: BasePayload): string {
  return [
    basePrompt(p),
    "",
    "AÇÃO: chat",
    "OBJETIVO: Responder perguntas livres sobre a agenda e tarefas do usuário, e PROPOR (não executar) ações.",
    "",
    "ESTILO:",
    "- Texto natural, curto. MÁX 4 frases por padrão.",
    "- Listas de tarefas/horários em tabela markdown enxuta (até 5 linhas) ou bullets.",
    "- Ao citar tarefa, mencionar (P1/P2/P3/P4) e horário se houver.",
    "",
    "CAPACIDADES: \"quando tenho 1h livre?\", \"que P1 estão sem horário?\", \"o que adiar pra liberar a tarde?\".",
    "Sugerir mudanças, mas SEMPRE terminar com: \"Quer que eu prepare essas mudanças no Organizar?\" — nunca aplicar pelo chat.",
    "Se exigir outra action (criar/mover/deletar), responder com recomendação textual + caminho na UI.",
    "",
    "PROIBIDO: inventar tarefa fora de `scheduled`, dar conselhos genéricos de produtividade, falar de dias fora do contexto sem avisar.",
  ].join("\n");
}

// ===================== AI CALL =====================

async function callAI(body: Record<string, unknown>): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const r = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: DEFAULT_MODEL, ...body }),
  });
  if (r.status === 429) {
    return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (r.status === 402) {
    return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione fundos em Configurações → Workspace → Uso." }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!r.ok) {
    const t = await r.text();
    console.error("AI gateway error", r.status, t);
    return new Response(JSON.stringify({ error: "Falha ao chamar a IA", detail: t }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = (await req.json()) as BasePayload;
    if (!payload?.action) {
      return new Response(JSON.stringify({ error: "action é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- suggest-slot ----------
    if (payload.action === "suggest-slot") {
      if (!payload.task?.title) {
        return new Response(JSON.stringify({ error: "task.title obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userMsg = [
        "Sugira o MELHOR horário para esta nova tarefa (retorne via tool call).",
        `Título: ${payload.task.title}`,
        payload.task.description ? `Descrição: ${payload.task.description}` : "",
        `Duração estimada (se houver): ${payload.task.durationMinutes ?? "—"} min`,
        `Prioridade (se houver): P${payload.task.priority ?? "—"}`,
        payload.task.deadline ? `Prazo final: ${payload.task.deadline}` : "",
      ].filter(Boolean).join("\n");

      const aiResp = await callAI({
        messages: [
          { role: "system", content: suggestPrompt(payload) },
          { role: "user", content: userMsg },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_slot",
            description: "Retorna o melhor horário para a tarefa.",
            parameters: {
              type: "object",
              properties: {
                date: { type: "string", description: "YYYY-MM-DD ou \"\" se nenhum slot disponível" },
                time: { type: "string", description: "HH:mm (24h)" },
                durationMinutes: { type: "number" },
                inferredPriority: { type: "number", description: "1..4 (4=P1)" },
                reason: { type: "string", description: "Justificativa curta em PT-BR (até 15 palavras)" },
                alternatives: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string" },
                      time: { type: "string" },
                      durationMinutes: { type: "number" },
                      reason: { type: "string" },
                    },
                    required: ["date", "time", "durationMinutes", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["date", "time", "durationMinutes", "reason"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_slot" } },
      });
      if (!aiResp.ok) return aiResp;
      const data = await aiResp.json();
      const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : null;
      return new Response(JSON.stringify({ result: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- organize-day ----------
    if (payload.action === "organize-day") {
      const date = payload.targetDate ?? payload.date ?? payload.today;
      const userMsg = [
        `Distribua estas tarefas no dia ${date} respeitando AGENDA + EVENTOS do contexto.`,
        "Tarefas a posicionar:",
        fmtUnscheduled(payload.unscheduled),
        "Retorne via tool call. Não mude o id.",
      ].join("\n");

      const aiResp = await callAI({
        messages: [
          { role: "system", content: organizePrompt(payload) },
          { role: "user", content: userMsg },
        ],
        tools: [{
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
                      rationale: { type: "string" },
                      confidence: { type: "string", enum: ["alta", "media", "baixa"] },
                    },
                    required: ["id", "date", "time", "durationMinutes", "rationale"],
                    additionalProperties: false,
                  },
                },
                unscheduledOut: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      reason: { type: "string", enum: ["semSlot", "duracaoIncompativel", "foraDoExpediente", "conflitoFeriado"] },
                    },
                    required: ["id", "reason"],
                    additionalProperties: false,
                  },
                },
                summary: { type: "string" },
                requiresConfirmation: { type: "boolean" },
              },
              required: ["assignments", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "organize_day" } },
      });
      if (!aiResp.ok) return aiResp;
      const data = await aiResp.json();
      const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : null;
      return new Response(JSON.stringify({ result: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- analyze-day ----------
    if (payload.action === "analyze-day") {
      const date = payload.targetDate ?? payload.date ?? payload.today;
      const userMsg = `Analise o dia ${date} e retorne via tool call.`;

      const aiResp = await callAI({
        messages: [
          { role: "system", content: analyzePrompt(payload) },
          { role: "user", content: userMsg },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_day",
            description: "Diagnóstico acionável do dia.",
            parameters: {
              type: "object",
              properties: {
                workloadScore: { type: "number" },
                workloadLabel: { type: "string", enum: ["leve", "equilibrado", "apertado", "sobrecarregado"] },
                topPriorities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { taskId: { type: "string" }, why: { type: "string" } },
                    required: ["taskId", "why"],
                    additionalProperties: false,
                  },
                },
                conflicts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["overlap", "noSlot", "afterHours", "holidayWork", "p1WithoutTime"] },
                      description: { type: "string" },
                      taskIds: { type: "array", items: { type: "string" } },
                    },
                    required: ["type", "description"],
                    additionalProperties: false,
                  },
                },
                risks: { type: "array", items: { type: "string" } },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string" },
                      rationale: { type: "string" },
                      taskIds: { type: "array", items: { type: "string" } },
                    },
                    required: ["action", "rationale"],
                    additionalProperties: false,
                  },
                },
                focusBlock: {
                  type: "object",
                  properties: {
                    start: { type: "string" },
                    end: { type: "string" },
                    durationMin: { type: "number" },
                  },
                  required: ["start", "end", "durationMin"],
                  additionalProperties: false,
                },
                summary: { type: "string" },
              },
              required: ["workloadScore", "workloadLabel", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_day" } },
      });
      if (!aiResp.ok) return aiResp;
      const data = await aiResp.json();
      const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : null;
      return new Response(JSON.stringify({ result: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- chat ----------
    if (payload.action === "chat") {
      const messages = payload.messages ?? [];
      const aiResp = await callAI({
        messages: [
          { role: "system", content: chatPrompt(payload) },
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
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-assistant error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
