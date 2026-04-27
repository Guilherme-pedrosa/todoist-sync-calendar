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
  } | null;
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
          supabase.from("tasks").select("id, title, due_date, project_id").eq("user_id", user.id),
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

      // 5. Sync tasks — dedup by (title + due_date)
      const existingKey = new Set<string>();
      for (const t of existingTasks || []) {
        existingKey.add(`${t.title.toLowerCase()}|${t.due_date || ""}`);
      }

      const tasksToInsert: { task: TodoistTask; row: any }[] = [];
      for (const tt of tdTasks) {
        if (tt.is_completed) continue;
        const dueDate = tt.due?.date || (tt.due?.datetime ? tt.due.datetime.slice(0, 10) : null);
        const dueTime = tt.due?.datetime
          ? tt.due.datetime.slice(11, 19) // HH:MM:SS
          : null;
        const key = `${tt.content.toLowerCase()}|${dueDate || ""}`;
        if (existingKey.has(key)) continue;
        existingKey.add(key);

        const projectId = (tt.project_id && projectIdMap.get(tt.project_id)) || inboxProject?.id || null;

        tasksToInsert.push({
          task: tt,
          row: {
            user_id: user.id,
            title: tt.content,
            description: tt.description || null,
            priority: mapPriority(tt.priority),
            due_date: dueDate,
            due_time: dueTime,
            project_id: projectId,
          },
        });
      }

      let createdTasks = 0;
      let createdTaskLabels = 0;
      if (tasksToInsert.length > 0) {
        const { data: insertedTasks, error: tErr } = await supabase
          .from("tasks").insert(tasksToInsert.map((x) => x.row)).select("id");
        if (tErr) throw new Error(`Erro ao criar tarefas: ${tErr.message}`);

        // Attach labels via task_labels
        const linkRows: { task_id: string; label_id: string }[] = [];
        (insertedTasks || []).forEach((row, idx) => {
          const td = tasksToInsert[idx].task;
          for (const labelName of td.labels || []) {
            const lid = labelIdByName.get(labelName.toLowerCase());
            if (lid) linkRows.push({ task_id: row.id, label_id: lid });
          }
        });
        if (linkRows.length > 0) {
          const { error: tlErr } = await supabase.from("task_labels").insert(linkRows);
          if (!tlErr) createdTaskLabels = linkRows.length;
        }
        createdTasks = insertedTasks?.length || 0;
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
