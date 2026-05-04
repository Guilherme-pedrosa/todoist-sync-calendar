import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const workspaceId = String(body.workspace_id || "");
    if (!workspaceId) return json({ error: "workspace_id required" }, 400);

    // ---- start: open or reuse a session
    if (action === "start") {
      // close stale open sessions (older than 10min last_seen)
      await supabase
        .from("activity_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("ended_at", null)
        .lt("last_seen_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

      const { data: session, error } = await supabase
        .from("activity_sessions")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          user_agent: req.headers.get("user-agent") || null,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ session_id: session.id });
    }

    // ---- heartbeat: append a heartbeat + update session counters
    if (action === "heartbeat") {
      const sessionId = String(body.session_id || "");
      if (!sessionId) return json({ error: "session_id required" }, 400);
      const isActive = body.is_active !== false;
      const isFocused = body.is_focused !== false;
      const route = typeof body.route === "string" ? body.route.slice(0, 200) : null;
      const interactions = Number(body.interactions || 0);
      const seconds = Math.max(1, Math.min(120, Number(body.seconds || 30)));

      // insert heartbeat
      await supabase.from("activity_heartbeats").insert({
        session_id: sessionId,
        user_id: user.id,
        workspace_id: workspaceId,
        is_active: isActive,
        is_focused: isFocused,
        route,
        interactions,
      });

      // update session counters
      const { data: sess } = await supabase
        .from("activity_sessions")
        .select("active_seconds, idle_seconds")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (sess) {
        const patch = isActive
          ? { active_seconds: (sess.active_seconds || 0) + seconds, last_seen_at: new Date().toISOString() }
          : { idle_seconds: (sess.idle_seconds || 0) + seconds, last_seen_at: new Date().toISOString() };
        await supabase.from("activity_sessions").update(patch).eq("id", sessionId);
      }

      return json({ ok: true });
    }

    // ---- idle_start
    if (action === "idle_start") {
      const sessionId = String(body.session_id || "");
      if (!sessionId) return json({ error: "session_id required" }, 400);
      const { data, error } = await supabase
        .from("activity_idle_periods")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          workspace_id: workspaceId,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ idle_id: data.id });
    }

    // ---- idle_end
    if (action === "idle_end") {
      const idleId = String(body.idle_id || "");
      if (!idleId) return json({ error: "idle_id required" }, 400);
      const { data: row } = await supabase
        .from("activity_idle_periods")
        .select("started_at")
        .eq("id", idleId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!row) return json({ ok: true });
      const dur = Math.max(1, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000));
      await supabase
        .from("activity_idle_periods")
        .update({ ended_at: new Date().toISOString(), duration_seconds: dur })
        .eq("id", idleId);
      return json({ ok: true, duration_seconds: dur });
    }

    // ---- url_visit_start: open a new URL visit (closes any previous open one for this user)
    if (action === "url_visit_start") {
      const sessionId = body.session_id ? String(body.session_id) : null;
      const domain = String(body.domain || "").slice(0, 200).toLowerCase();
      const path = body.path ? String(body.path).slice(0, 500) : null;
      const title = body.title ? String(body.title).slice(0, 300) : null;
      const wasFocused = body.was_focused !== false;
      if (!domain) return json({ error: "domain required" }, 400);

      // close previous open visit (if any)
      const nowIso = new Date().toISOString();
      const { data: open } = await supabase
        .from("activity_url_visits")
        .select("id, started_at")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open) {
        const dur = Math.max(1, Math.floor((Date.now() - new Date(open.started_at).getTime()) / 1000));
        // ignore tiny visits (<2s) to reduce noise
        if (dur < 2) {
          await supabase.from("activity_url_visits").delete().eq("id", open.id);
        } else {
          await supabase
            .from("activity_url_visits")
            .update({ ended_at: nowIso, duration_seconds: dur })
            .eq("id", open.id);
        }
      }

      const { data, error } = await supabase
        .from("activity_url_visits")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          session_id: sessionId,
          domain,
          path,
          title,
          was_focused: wasFocused,
        })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ visit_id: data.id });
    }

    // ---- url_visit_end: close current open visit
    if (action === "url_visit_end") {
      const { data: open } = await supabase
        .from("activity_url_visits")
        .select("id, started_at")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!open) return json({ ok: true });
      const dur = Math.max(1, Math.floor((Date.now() - new Date(open.started_at).getTime()) / 1000));
      await supabase
        .from("activity_url_visits")
        .update({ ended_at: new Date().toISOString(), duration_seconds: dur })
        .eq("id", open.id);
      return json({ ok: true, duration_seconds: dur });
    }

    // ---- end: close session
    if (action === "end") {
      const sessionId = String(body.session_id || "");
      if (!sessionId) return json({ error: "session_id required" }, 400);
      // close any open visit too
      await supabase
        .from("activity_url_visits")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("ended_at", null);
      await supabase
        .from("activity_sessions")
        .update({ ended_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("user_id", user.id);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});
