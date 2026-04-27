import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TODOIST_BASE = "https://api.todoist.com/api/v1";

interface TodoistProject {
  id: string;
  name: string;
  color?: string;
  is_inbox_project?: boolean;
  inbox_project?: boolean;
}

interface TodoistLabel {
  id: string;
  name: string;
  color?: string;
}

interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  project_id?: string;
  parent_id?: string | null;
  priority?: number; // Todoist: 1 (normal) .. 4 (urgent)
  is_completed?: boolean;
  labels?: string[]; // label names
  due?: {
    date?: string;
    datetime?: string;
    string?: string;
    is_recurring?: boolean;
    timezone?: string | null;
  } | null;
  deadline?: {
    date?: string;
  } | null;
  duration?: {
    amount?: number;
    unit?: "minute" | "day";
  } | null;
}

// Convert a Todoist `due.string` into an RRULE (RFC 5545) when recurring.
// Best-effort PT-BR + EN parser. Returns null if not recognized.
const DAY_MAP_EN: Record<string, string> = {
  monday: "MO", mon: "MO", tuesday: "TU", tue: "TU", tues: "TU",
  wednesday: "WE", wed: "WE", thursday: "TH", thu: "TH", thurs: "TH",
  friday: "FR", fri: "FR", saturday: "SA", sat: "SA", sunday: "SU", sun: "SU",
};
const DAY_MAP_PT: Record<string, string> = {
  "segunda": "MO", "segunda-feira": "MO", "seg": "MO",
  "terca": "TU", "terça": "TU", "terca-feira": "TU", "terça-feira": "TU", "ter": "TU",
  "quarta": "WE", "quarta-feira": "WE", "qua": "WE",
  "quinta": "TH", "quinta-feira": "TH", "qui": "TH",
  "sexta": "FR", "sexta-feira": "FR", "sex": "FR",
  "sabado": "SA", "sábado": "SA", "sab": "SA",
  "domingo": "SU", "dom": "SU",
};
const DAY_MAP = { ...DAY_MAP_EN, ...DAY_MAP_PT };

function dueStringToRRule(
  dueString?: string,
  dueDate?: string | null,
  isRecurring?: boolean,
): string | null {
  // Trigger: confiar no flag oficial do Todoist quando disponível.
  // Quando não tem due_string mas é recurring, devolve fallback diário.
  if (!isRecurring && !dueString) return null;
  const s = (dueString || "").toLowerCase().trim();

  // Heurística adicional: alguns clientes não setam is_recurring corretamente.
  const looksRecurring =
    isRecurring === true ||
    /^(every|todo|toda|cada|a cada)\b/.test(s) ||
    /(diariamente|semanalmente|mensalmente|anualmente|quinzenalmente)/.test(s) ||
    /\b(dia útil|dia util|dias úteis|dias uteis|workday|workdays|weekday|weekdays)\b/.test(s);
  if (!looksRecurring) return null;

  // weekdays (segunda a sexta)
  if (/(every\s+(weekday|workday)s?|todo\s+(dia\s+)?(util|útil|workday|weekday)|toda\s+semana\s+util|dias?\s+(uteis|úteis)|workdays?|weekdays?)/.test(s)) {
    return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  }

  // every N (days|weeks|months|years) — also "a cada N dias"
  const intervalMatch = s.match(
    /(?:every|cada|a cada)\s+(\d+)\s*(day|days|week|weeks|month|months|year|years|dia|dias|semana|semanas|mes|meses|mês|ano|anos)/,
  );
  if (intervalMatch) {
    const n = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2];
    if (/day|dia/.test(unit)) return `FREQ=DAILY;INTERVAL=${n}`;
    if (/week|semana/.test(unit)) return `FREQ=WEEKLY;INTERVAL=${n}`;
    if (/month|mes|meses|mês/.test(unit)) return `FREQ=MONTHLY;INTERVAL=${n}`;
    if (/year|ano/.test(unit)) return `FREQ=YEARLY;INTERVAL=${n}`;
  }

  // quinzenal
  if (/quinzenalmente|a cada 2 semanas|every 2 weeks/.test(s)) {
    return "FREQ=WEEKLY;INTERVAL=2";
  }

  // every day / todo dia / diariamente
  if (/^(every day|todo dia|toda dia|cada dia|diariamente)/.test(s)) {
    return "FREQ=DAILY";
  }

  // every week / toda semana / semanalmente
  if (/^(every week|toda semana|cada semana|semanalmente)/.test(s) && !/\bevery\s+\w+day\b/.test(s)) {
    return "FREQ=WEEKLY";
  }

  // todo dia <N> (do mês) / every <N>th
  const monthDayMatch = s.match(/(?:todo dia|every)\s+(\d{1,2})(?:st|nd|rd|th|º)?\b/);
  if (monthDayMatch) {
    const day = parseInt(monthDayMatch[1], 10);
    if (!isNaN(day) && day >= 1 && day <= 31) {
      return `FREQ=MONTHLY;BYMONTHDAY=${day}`;
    }
  }

  // every month / todo mes / mensalmente
  if (/^(every month|todo mes|todo mês|cada mes|cada mês|mensalmente)/.test(s)) {
    if (dueDate) {
      const day = parseInt(dueDate.slice(8, 10), 10);
      if (!isNaN(day)) return `FREQ=MONTHLY;BYMONTHDAY=${day}`;
    }
    return "FREQ=MONTHLY";
  }

  // every year / todo ano / anualmente
  if (/^(every year|todo ano|cada ano|anualmente)/.test(s)) {
    return "FREQ=YEARLY";
  }

  // every <weekday> (e.g. "every monday", "toda segunda")
  const tokens = s.split(/[\s,]+/).slice(1);
  const days: string[] = [];
  for (const tok of tokens) {
    const cleaned = tok.replace(/[^a-zçãáéíóúâêô-]/g, "");
    if (DAY_MAP[cleaned]) days.push(DAY_MAP[cleaned]);
  }
  if (days.length > 0) {
    return `FREQ=WEEKLY;BYDAY=${days.join(",")}`;
  }

  // Fallback: Todoist diz que é recorrente mas não conseguimos parsear.
  // Salvamos como diária pra não perder a info; due_string original fica intacto pra display.
  if (isRecurring) {
    return "FREQ=DAILY";
  }

  return null;
}

function mergeImportedTask(existing: any, row: any): any | null {
  const patch: Record<string, unknown> = {};
  for (const key of ["due_date", "due_time", "duration_minutes", "due_string", "recurrence_rule", "deadline", "priority", "description"] as const) {
    if ((existing?.[key] == null || existing?.[key] === "") && row[key] != null && row[key] !== "") {
      patch[key] = row[key];
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}


// Todoist color name -> approximate HSL
const TODOIST_COLOR_MAP: Record<string, string> = {
  berry_red: "hsl(348, 83%, 47%)",
  red: "hsl(0, 72%, 51%)",
  orange: "hsl(24, 95%, 53%)",
  yellow: "hsl(45, 93%, 47%)",
  olive_green: "hsl(80, 50%, 40%)",
  lime_green: "hsl(90, 60%, 45%)",
  green: "hsl(142, 71%, 45%)",
  mint_green: "hsl(160, 60%, 50%)",
  teal: "hsl(180, 70%, 40%)",
  sky_blue: "hsl(200, 85%, 55%)",
  light_blue: "hsl(210, 90%, 65%)",
  blue: "hsl(217, 91%, 60%)",
  grape: "hsl(280, 60%, 50%)",
  violet: "hsl(262, 60%, 55%)",
  lavender: "hsl(270, 50%, 70%)",
  magenta: "hsl(320, 70%, 55%)",
  salmon: "hsl(10, 75%, 65%)",
  charcoal: "hsl(220, 10%, 30%)",
  grey: "hsl(220, 10%, 50%)",
  taupe: "hsl(30, 15%, 50%)",
};

const colorFromTodoist = (c?: string, fallback = "hsl(230, 10%, 50%)") =>
  (c && TODOIST_COLOR_MAP[c]) || fallback;

// Todoist priority (1 normal..4 urgent) -> app priority (1 highest..4 lowest)
const mapPriority = (p?: number) => {
  switch (p) {
    case 4: return 1; // urgent
    case 3: return 2;
    case 2: return 3;
    default: return 4;
  }
};

const mapDurationMinutes = (duration?: TodoistTask["duration"]): number | null => {
  if (!duration?.amount || duration.amount <= 0) return null;
  return duration.unit === "day" ? duration.amount * 24 * 60 : duration.amount;
};

// Insert tasks in topological waves so parent_id can be mapped Todoist -> app.
// Returns map of todoist task id -> created app task id (only for newly inserted).
async function insertTasksWithHierarchy(
  supabase: any,
  items: { task: TodoistTask; row: any }[],
): Promise<{ idMap: Map<string, string>; insertedRows: { todoistId: string; appId: string; task: TodoistTask }[] }> {
  const idMap = new Map<string, string>(); // todoist id -> app id
  const insertedRows: { todoistId: string; appId: string; task: TodoistTask }[] = [];
  const remaining = new Map<string, { task: TodoistTask; row: any }>();
  for (const it of items) remaining.set(it.task.id, it);

  let safety = 0;
  while (remaining.size > 0 && safety < 50) {
    safety++;
    const wave: { task: TodoistTask; row: any }[] = [];
    for (const it of remaining.values()) {
      const pid = it.task.parent_id;
      // ready if: no parent OR parent not in this batch (orphan -> root) OR parent already inserted
      if (!pid || (!remaining.has(pid) && !idMap.has(pid)) || idMap.has(pid)) {
        wave.push(it);
      }
    }
    if (wave.length === 0) {
      // cycle / unresolvable — promote everything else to root and break
      for (const it of remaining.values()) wave.push(it);
    }
    const rows = wave.map((it) => ({
      ...it.row,
      parent_id: it.task.parent_id ? idMap.get(it.task.parent_id) || null : null,
    }));
    const { data: inserted, error } = await supabase.from("tasks").insert(rows).select("id");
    if (error) throw new Error(`Erro ao criar tarefas: ${error.message}`);
    (inserted || []).forEach((r: any, i: number) => {
      const td = wave[i].task;
      idMap.set(td.id, r.id);
      insertedRows.push({ todoistId: td.id, appId: r.id, task: td });
      remaining.delete(td.id);
    });
  }
  return { idMap, insertedRows };
}

async function todoistFetch<T>(path: string, apiKey: string): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | null = null;
  let safety = 0;

  do {
    const sep = path.includes("?") ? "&" : "?";
    const cursorParam = cursor ? `${sep}cursor=${encodeURIComponent(cursor)}&limit=200` : `${sep}limit=200`;
    const res = await fetch(`${TODOIST_BASE}/${path}${cursorParam}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Todoist ${path} ${res.status}: ${text}`);
    }
    const data = await res.json();

    if (data && typeof data === "object" && "results" in data && Array.isArray((data as any).results)) {
      results.push(...((data as any).results as T[]));
      cursor = (data as any).next_cursor ?? null;
    } else if (Array.isArray(data)) {
      results.push(...(data as T[]));
      cursor = null;
    } else {
      cursor = null;
    }
    safety++;
  } while (cursor && safety < 50);

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TODOIST_API_KEY = Deno.env.get("TODOIST_API_KEY");
  if (!TODOIST_API_KEY) {
    return json({ error: "TODOIST_API_KEY not configured" }, 500);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // === IMPORT INBOX ONLY ===
  if (action === "import-inbox") {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Configuração do servidor inválida" }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);
    const userToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);
    if (userError || !user) return json({ error: "Usuário inválido" }, 401);

    try {
      const tdProjects = await todoistFetch<TodoistProject>("projects", TODOIST_API_KEY);
      const todoistInbox = tdProjects.find((p) => p.inbox_project || p.is_inbox_project);
      if (!todoistInbox) return json({ error: "Inbox do Todoist não encontrado" }, 404);

      const { data: appProjects } = await supabase
        .from("projects").select("id, is_inbox").eq("user_id", user.id).eq("is_inbox", true).limit(1);
      const appInbox = appProjects?.[0];
      if (!appInbox) return json({ error: "Caixa de Entrada do app não encontrada" }, 404);

      const tdLabels = await todoistFetch<TodoistLabel>("labels", TODOIST_API_KEY);
      const { data: existingLabels } = await supabase
        .from("labels").select("id, name").eq("user_id", user.id);
      const labelIdByName = new Map<string, string>();
      for (const l of existingLabels || []) labelIdByName.set(l.name.toLowerCase(), l.id);

      const labelsToCreate: any[] = [];
      for (const tl of tdLabels) {
        if (!labelIdByName.has(tl.name.toLowerCase())) {
          labelsToCreate.push({
            user_id: user.id,
            name: tl.name,
            color: colorFromTodoist(tl.color, "hsl(0, 72%, 51%)"),
          });
        }
      }
      if (labelsToCreate.length > 0) {
        const { data: inserted } = await supabase
          .from("labels").insert(labelsToCreate).select("id, name");
        for (const row of inserted || []) labelIdByName.set(row.name.toLowerCase(), row.id);
      }

      const tdTasks = await todoistFetch<TodoistTask>(
        `tasks?project_id=${todoistInbox.id}`,
        TODOIST_API_KEY,
      );

      const { data: existingTasks } = await supabase
        .from("tasks").select("id, title, due_date, due_time, duration_minutes, due_string, recurrence_rule, deadline, priority, description").eq("user_id", user.id).eq("project_id", appInbox.id);
      const existingByKey = new Map<string, any>();
      for (const t of existingTasks || []) {
        existingByKey.set(`${t.title.toLowerCase()}|${t.due_date || ""}|`, t);
      }

      const tasksToInsert: { task: TodoistTask; row: any }[] = [];
      for (const tt of tdTasks) {
        if (tt.is_completed) continue;
        const dueDate = tt.due?.date || (tt.due?.datetime ? tt.due.datetime.slice(0, 10) : null);
        const dueTime = tt.due?.datetime ? tt.due.datetime.slice(11, 19) : null;
        const dueString = tt.due?.string || null;
        const recurrenceRule = dueStringToRRule(dueString || undefined, dueDate, tt.due?.is_recurring);
        const deadline = tt.deadline?.date || null;
        const durationMinutes = mapDurationMinutes(tt.duration);
        const key = `${tt.content.toLowerCase()}|${dueDate || ""}|${tt.parent_id || ""}`;
        const existing = existingByKey.get(key);
        if (existing) {
          const patch = mergeImportedTask(existing, {
            description: tt.description || null,
            priority: mapPriority(tt.priority),
            due_date: dueDate,
            due_time: dueTime,
            duration_minutes: durationMinutes,
            due_string: dueString,
            recurrence_rule: recurrenceRule,
            deadline,
          });
          if (patch) await supabase.from("tasks").update(patch).eq("id", existing.id);
          continue;
        }
        existingByKey.set(key, { id: null });

        tasksToInsert.push({
          task: tt,
          row: {
            user_id: user.id,
            title: tt.content,
            description: tt.description || null,
            priority: mapPriority(tt.priority),
            due_date: dueDate,
            due_time: dueTime,
            duration_minutes: durationMinutes,
            due_string: dueString,
            recurrence_rule: recurrenceRule,
            deadline: deadline,
            project_id: appInbox.id,
          },
        });
      }

      let createdTasks = 0;
      let createdTaskLabels = 0;
      if (tasksToInsert.length > 0) {
        const { idMap, insertedRows } = await insertTasksWithHierarchy(supabase, tasksToInsert);

        const linkRows: { task_id: string; label_id: string }[] = [];
        for (const r of insertedRows) {
          for (const labelName of r.task.labels || []) {
            const lid = labelIdByName.get(labelName.toLowerCase());
            if (lid) linkRows.push({ task_id: r.appId, label_id: lid });
          }
        }
        if (linkRows.length > 0) {
          const { error: linkErr } = await supabase.from("task_labels").insert(linkRows);
          if (!linkErr) createdTaskLabels = linkRows.length;
        }
        createdTasks = insertedRows.length;
        void idMap;
      }

      return json({
        success: true,
        totalFromTodoist: tdTasks.length,
        createdTasks,
        createdTaskLabels,
      });
    } catch (e) {
      console.error("[todoist-proxy] import-inbox error:", e);
      return json({ error: (e as Error).message }, 500);
    }
  }

  // === IMPORT ALL ===
  if (action === "import-all") {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Configuração do servidor inválida" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autorizado" }, 401);
    }
    const userToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);
    if (userError || !user) return json({ error: "Usuário inválido" }, 401);

    try {
      // 1. Fetch from Todoist (paginated)
      const [tdProjects, tdLabels, tdTasks] = await Promise.all([
        todoistFetch<TodoistProject>("projects", TODOIST_API_KEY),
        todoistFetch<TodoistLabel>("labels", TODOIST_API_KEY),
        todoistFetch<TodoistTask>("tasks", TODOIST_API_KEY),
      ]);

      // 2. Existing app data
      const [{ data: existingProjects }, { data: existingLabels }, { data: existingTasks }] =
        await Promise.all([
          supabase.from("projects").select("id, name, is_inbox").eq("user_id", user.id),
          supabase.from("labels").select("id, name").eq("user_id", user.id),
          supabase.from("tasks").select("id, title, due_date, due_time, duration_minutes, due_string, recurrence_rule, deadline, priority, description, project_id").eq("user_id", user.id),
        ]);

      // 3. Sync projects (dedup by name; map Todoist Inbox -> app Inbox)
      const projectIdMap = new Map<string, string>(); // todoist id -> app id
      const projectsByName = new Map<string, { id: string; isInbox: boolean }>();
      for (const p of existingProjects || []) {
        projectsByName.set(p.name.toLowerCase(), { id: p.id, isInbox: p.is_inbox });
      }
      const inboxProject = (existingProjects || []).find((p) => p.is_inbox);

      let createdProjects = 0;
      const projectsToInsert: any[] = [];
      const todoistProjectByTempKey = new Map<string, TodoistProject>();

      for (const tp of tdProjects) {
        const isInbox = tp.inbox_project || tp.is_inbox_project;
        if (isInbox && inboxProject) {
          projectIdMap.set(tp.id, inboxProject.id);
          continue;
        }
        const existing = projectsByName.get(tp.name.toLowerCase());
        if (existing) {
          projectIdMap.set(tp.id, existing.id);
          continue;
        }
        projectsToInsert.push({
          user_id: user.id,
          name: tp.name,
          color: colorFromTodoist(tp.color),
          is_inbox: false,
        });
        todoistProjectByTempKey.set(tp.name.toLowerCase(), tp);
      }

      if (projectsToInsert.length > 0) {
        const { data: inserted, error: pErr } = await supabase
          .from("projects").insert(projectsToInsert).select("id, name");
        if (pErr) throw new Error(`Erro ao criar projetos: ${pErr.message}`);
        for (const row of inserted || []) {
          const tp = todoistProjectByTempKey.get(row.name.toLowerCase());
          if (tp) projectIdMap.set(tp.id, row.id);
          createdProjects++;
        }
      }

      // 4. Sync labels (dedup by name)
      const labelIdByName = new Map<string, string>();
      for (const l of existingLabels || []) labelIdByName.set(l.name.toLowerCase(), l.id);

      let createdLabels = 0;
      const labelsToInsert: any[] = [];
      for (const tl of tdLabels) {
        if (labelIdByName.has(tl.name.toLowerCase())) continue;
        labelsToInsert.push({
          user_id: user.id,
          name: tl.name,
          color: colorFromTodoist(tl.color, "hsl(0, 72%, 51%)"),
        });
      }
      if (labelsToInsert.length > 0) {
        const { data: inserted, error: lErr } = await supabase
          .from("labels").insert(labelsToInsert).select("id, name");
        if (lErr) throw new Error(`Erro ao criar labels: ${lErr.message}`);
        for (const row of inserted || []) {
          labelIdByName.set(row.name.toLowerCase(), row.id);
          createdLabels++;
        }
      }

      // 5. Sync tasks — dedup by (title + due_date + project_id)
      const existingByKey = new Map<string, any>();
      for (const t of existingTasks || []) {
        existingByKey.set(`${t.title.toLowerCase()}|${t.due_date || ""}|${t.project_id || ""}|`, t);
      }

      const tasksToInsert: { task: TodoistTask; row: any }[] = [];
      for (const tt of tdTasks) {
        if (tt.is_completed) continue;
        const dueDate = tt.due?.date || (tt.due?.datetime ? tt.due.datetime.slice(0, 10) : null);
        const dueTime = tt.due?.datetime
          ? tt.due.datetime.slice(11, 19) // HH:MM:SS
          : null;
        const dueString = tt.due?.string || null;
        const recurrenceRule = dueStringToRRule(dueString || undefined, dueDate, tt.due?.is_recurring);
        const deadline = tt.deadline?.date || null;
        const durationMinutes = mapDurationMinutes(tt.duration);

        const projectId = (tt.project_id && projectIdMap.get(tt.project_id)) || inboxProject?.id || null;
        const key = `${tt.content.toLowerCase()}|${dueDate || ""}|${projectId || ""}|${tt.parent_id || ""}`;
        const existing = existingByKey.get(key);
        if (existing) {
          const patch = mergeImportedTask(existing, {
            description: tt.description || null,
            priority: mapPriority(tt.priority),
            due_date: dueDate,
            due_time: dueTime,
            duration_minutes: durationMinutes,
            due_string: dueString,
            recurrence_rule: recurrenceRule,
            deadline,
          });
          if (patch) await supabase.from("tasks").update(patch).eq("id", existing.id);
          continue;
        }
        existingByKey.set(key, { id: null });

        tasksToInsert.push({
          task: tt,
          row: {
            user_id: user.id,
            title: tt.content,
            description: tt.description || null,
            priority: mapPriority(tt.priority),
            due_date: dueDate,
            due_time: dueTime,
            duration_minutes: durationMinutes,
            due_string: dueString,
            recurrence_rule: recurrenceRule,
            deadline: deadline,
            project_id: projectId,
          },
        });
      }

      let createdTasks = 0;
      let createdTaskLabels = 0;
      if (tasksToInsert.length > 0) {
        const { insertedRows } = await insertTasksWithHierarchy(supabase, tasksToInsert);

        // Attach labels via task_labels
        const linkRows: { task_id: string; label_id: string }[] = [];
        for (const r of insertedRows) {
          for (const labelName of r.task.labels || []) {
            const lid = labelIdByName.get(labelName.toLowerCase());
            if (lid) linkRows.push({ task_id: r.appId, label_id: lid });
          }
        }
        if (linkRows.length > 0) {
          const { error: tlErr } = await supabase.from("task_labels").insert(linkRows);
          if (!tlErr) createdTaskLabels = linkRows.length;
        }
        createdTasks = insertedRows.length;
      }

      return json({
        success: true,
        createdProjects,
        createdLabels,
        createdTasks,
        createdTaskLabels,
        skippedTasks: tdTasks.length - createdTasks,
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
    }
  }

  // === Legacy passthrough: /todoist-proxy?endpoint=projects ===
  const endpoint = url.searchParams.get("endpoint") || "projects";
  try {
    const res = await fetch(`${TODOIST_BASE}/${endpoint}`, {
      headers: { Authorization: `Bearer ${TODOIST_API_KEY}` },
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
