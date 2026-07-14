import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const webhookUrl = Deno.env.get("FLEETDESK_WEBHOOK_URL");
    const callbackKey = Deno.env.get("FLEETDESK_CALLBACK_KEY");
    if (!webhookUrl || !callbackKey) {
      console.error("[fleetdesk-notify-status] Missing FLEETDESK_WEBHOOK_URL or FLEETDESK_CALLBACK_KEY");
      return json({ error: "Server misconfigured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { task_id, completed, completed_at } = body as {
      task_id?: string;
      completed?: boolean;
      completed_at?: string | null;
    };

    if (!task_id || typeof completed !== "boolean") {
      return json({ error: "task_id and completed are required" }, 400);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);

    if (token !== serviceRoleKey) {
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

      const { data: hasAccess, error: accessError } = await admin.rpc("has_task_access", {
        _task_id: task_id,
        _user_id: userData.user.id,
      });
      if (accessError) {
        console.error("[fleetdesk-notify-status] task access check failed", accessError);
        return json({ error: "task access check failed" }, 500);
      }
      if (!hasAccess) return json({ error: "forbidden" }, 403);
    }

    // Resolve external_ref from link table or tasks table
    let externalRef: string | null = null;
    const { data: link } = await admin
      .from("fleetdesk_task_links")
      .select("external_ref")
      .eq("task_id", task_id)
      .maybeSingle();
    externalRef = link?.external_ref ?? null;

    if (!externalRef) {
      const { data: t } = await admin
        .from("tasks")
        .select("external_ref, external_source")
        .eq("id", task_id)
        .maybeSingle();
      if (t?.external_source === "fleetdesk") externalRef = t.external_ref ?? null;
    }

    if (!externalRef) {
      console.log("[fleetdesk-notify-status] No fleetdesk link for task", task_id);
      return json({ ok: true, skipped: true });
    }

    const status = completed ? "done" : "todo";
    const payload = {
      external_ref: externalRef,
      status,
      completed_at: completed ? (completed_at ?? new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-callback-key": callbackKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("[fleetdesk-notify-status] Webhook failed", res.status, text);
      return json({ ok: false, status: res.status, body: text }, 502);
    }

    console.log("[fleetdesk-notify-status] Sent", externalRef, status);
    return json({ ok: true, external_ref: externalRef, status });
  } catch (err) {
    console.error("[fleetdesk-notify-status] Error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
