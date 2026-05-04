import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface SessionRow {
  id: string;
  user_id: string;
  workspace_id: string;
  started_at: string;
  ended_at: string | null;
  last_seen_at: string;
  active_seconds: number;
  idle_seconds: number;
}

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const targetDay =
      String(body.day || url.searchParams.get("day") || "") ||
      // default: yesterday + today
      "";

    const days: string[] = [];
    if (targetDay) {
      days.push(targetDay);
    } else {
      const today = new Date();
      const yest = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      days.push(yest.toISOString().slice(0, 10), today.toISOString().slice(0, 10));
    }

    let processed = 0;

    for (const day of days) {
      const dayStart = new Date(`${day}T00:00:00.000Z`).toISOString();
      const dayEnd = new Date(`${day}T23:59:59.999Z`).toISOString();

      // 1) sessions overlapping the day
      const { data: sessions } = await supabase
        .from("activity_sessions")
        .select("id, user_id, workspace_id, started_at, ended_at, last_seen_at, active_seconds, idle_seconds")
        .or(`and(started_at.lte.${dayEnd},ended_at.gte.${dayStart}),and(started_at.lte.${dayEnd},ended_at.is.null)`);

      const buckets = new Map<string, {
        user_id: string;
        workspace_id: string;
        active: number;
        idle: number;
        online: number;
        sessions: number;
        first: string | null;
        last: string | null;
        hourly: Record<string, number>;
      }>();

      for (const s of (sessions as SessionRow[] | null) || []) {
        const started = new Date(s.started_at);
        const ended = new Date(s.ended_at || s.last_seen_at);
        // only count overlap within the day
        const lo = new Date(Math.max(started.getTime(), new Date(dayStart).getTime()));
        const hi = new Date(Math.min(ended.getTime(), new Date(dayEnd).getTime()));
        if (hi <= lo) continue;

        const key = `${s.user_id}|${s.workspace_id}`;
        let agg = buckets.get(key);
        if (!agg) {
          agg = { user_id: s.user_id, workspace_id: s.workspace_id, active: 0, idle: 0, online: 0, sessions: 0, first: null, last: null, hourly: {} };
          buckets.set(key, agg);
        }
        const overlapSec = Math.floor((hi.getTime() - lo.getTime()) / 1000);
        agg.online += overlapSec;
        agg.sessions += 1;
        // proportional active/idle if session spans multiple days
        const totalSec = Math.max(1, Math.floor((ended.getTime() - started.getTime()) / 1000));
        const ratio = overlapSec / totalSec;
        agg.active += Math.floor((s.active_seconds || 0) * ratio);
        agg.idle += Math.floor((s.idle_seconds || 0) * ratio);
        if (!agg.first || lo.toISOString() < agg.first) agg.first = lo.toISOString();
        if (!agg.last || hi.toISOString() > agg.last) agg.last = hi.toISOString();
      }

      // 2) hourly buckets from heartbeats (active only)
      const { data: hbs } = await supabase
        .from("activity_heartbeats")
        .select("user_id, workspace_id, ts, is_active")
        .gte("ts", dayStart)
        .lte("ts", dayEnd);

      for (const h of (hbs as any[] | null) || []) {
        if (!h.is_active) continue;
        const key = `${h.user_id}|${h.workspace_id}`;
        const agg = buckets.get(key);
        if (!agg) continue;
        const hour = String(new Date(h.ts).getUTCHours());
        agg.hourly[hour] = (agg.hourly[hour] || 0) + 30; // approx 30s per heartbeat
      }

      // 3) tasks completed that day per user (using activity_log)
      const { data: completions } = await supabase
        .from("activity_log")
        .select("user_id, payload, created_at")
        .eq("entity_type", "task")
        .eq("action", "completed")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);

      // Need workspace per task → fetch task workspace_ids
      const taskIds = ((completions as any[] | null) || [])
        .map((c) => c.payload?.task_id || c.entity_id)
        .filter(Boolean);

      const projectByTask = new Map<string, { project_id: string | null; workspace_id: string; project_name?: string }>();
      if (taskIds.length) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, project_id, workspace_id, projects(name, is_inbox)")
          .in("id", taskIds);
        for (const t of (tasks as any[] | null) || []) {
          projectByTask.set(t.id, {
            project_id: t.project_id,
            workspace_id: t.workspace_id,
            project_name: t.projects?.name,
          });
        }
      }

      const taskAgg = new Map<string, {
        total: number; with_project: number; inbox: number;
        by_project: Record<string, { name: string; tasks: number; seconds: number }>;
      }>();

      for (const c of (completions as any[] | null) || []) {
        const taskId = c.payload?.task_id;
        const meta = taskId ? projectByTask.get(taskId) : null;
        if (!meta) continue;
        const key = `${c.user_id}|${meta.workspace_id}`;
        let ta = taskAgg.get(key);
        if (!ta) {
          ta = { total: 0, with_project: 0, inbox: 0, by_project: {} };
          taskAgg.set(key, ta);
        }
        ta.total += 1;
        const projName = meta.project_name || "—";
        const isInbox = projName.toLowerCase().includes("caixa de entrada") || projName.toLowerCase().includes("inbox");
        if (isInbox) ta.inbox += 1; else ta.with_project += 1;
        const pid = meta.project_id || "inbox";
        if (!ta.by_project[pid]) ta.by_project[pid] = { name: projName, tasks: 0, seconds: 0 };
        ta.by_project[pid].tasks += 1;
      }

      // 3.5) URL visits per user/workspace
      const { data: visits } = await supabase
        .from("activity_url_visits")
        .select("user_id, workspace_id, domain, started_at, ended_at, duration_seconds")
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd);

      // load all domain categories per workspace seen
      const wsSeen = new Set<string>();
      for (const v of (visits as any[] | null) || []) wsSeen.add(v.workspace_id);
      const catMap = new Map<string, string>(); // `${ws}|${domain}` -> category
      if (wsSeen.size) {
        const { data: cats } = await supabase
          .from("domain_categories")
          .select("workspace_id, domain, category")
          .in("workspace_id", [...wsSeen]);
        for (const c of (cats as any[] | null) || []) {
          catMap.set(`${c.workspace_id}|${c.domain}`, c.category);
        }
      }

      const urlAgg = new Map<string, {
        productive: number; neutral: number; distracting: number;
        byDomain: Record<string, { seconds: number; category: string }>;
      }>();

      for (const v of (visits as any[] | null) || []) {
        const dur = v.duration_seconds ||
          (v.ended_at ? Math.floor((new Date(v.ended_at).getTime() - new Date(v.started_at).getTime()) / 1000) : 0);
        if (dur < 1) continue;
        const key = `${v.user_id}|${v.workspace_id}`;
        let ua = urlAgg.get(key);
        if (!ua) { ua = { productive: 0, neutral: 0, distracting: 0, byDomain: {} }; urlAgg.set(key, ua); }
        const cat = catMap.get(`${v.workspace_id}|${v.domain}`) || "neutral";
        if (cat === "productive") ua.productive += dur;
        else if (cat === "distracting") ua.distracting += dur;
        else ua.neutral += dur;
        if (!ua.byDomain[v.domain]) ua.byDomain[v.domain] = { seconds: 0, category: cat };
        ua.byDomain[v.domain].seconds += dur;
      }

      // 4) write daily_activity_stats
      const allKeys = new Set<string>([...buckets.keys(), ...taskAgg.keys(), ...urlAgg.keys()]);
      for (const key of allKeys) {
        const [user_id, workspace_id] = key.split("|");
        const agg = buckets.get(key);
        const tasks = taskAgg.get(key);
        const urls = urlAgg.get(key);

        const active = agg?.active || 0;
        const idle = agg?.idle || 0;
        const online = agg?.online || 0;
        const tasksCompleted = tasks?.total || 0;

        const productive = urls?.productive || 0;
        const neutral = urls?.neutral || 0;
        const distracting = urls?.distracting || 0;
        const topDomains = Object.entries(urls?.byDomain || {})
          .map(([domain, v]) => ({ domain, seconds: v.seconds, category: v.category }))
          .sort((a, b) => b.seconds - a.seconds)
          .slice(0, 15);

        // score: 30% activity ratio + 30% productivity (10 tasks) + 20% low-idle + 20% productive sites ratio
        const activityRatio = online > 0 ? active / online : 0;
        const productivity = Math.min(1, tasksCompleted / 10);
        const lowIdle = online > 0 ? 1 - idle / online : 0;
        const totalUrl = productive + neutral + distracting;
        const productiveRatio = totalUrl > 0
          ? (productive + neutral * 0.5) / totalUrl - (distracting / totalUrl) * 0.5
          : 0;
        const score = Math.max(0, Math.round(
          (0.3 * activityRatio + 0.3 * productivity + 0.2 * lowIdle + 0.2 * Math.max(0, productiveRatio)) * 100
        ));

        await supabase.from("daily_activity_stats").upsert(
          {
            user_id, workspace_id, day,
            active_seconds: active, idle_seconds: idle, online_seconds: online,
            sessions_count: agg?.sessions || 0,
            first_seen_at: agg?.first || null,
            last_seen_at: agg?.last || null,
            tasks_completed: tasksCompleted,
            tasks_completed_with_project: tasks?.with_project || 0,
            tasks_completed_inbox: tasks?.inbox || 0,
            activity_score: score,
            hourly_buckets: agg?.hourly || {},
            by_project: tasks?.by_project || {},
            productive_seconds: productive,
            neutral_seconds: neutral,
            distracting_seconds: distracting,
            top_domains: topDomains,
            computed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,workspace_id,day" },
        );
        processed++;
      }
    }

    return json({ ok: true, days, processed });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});
