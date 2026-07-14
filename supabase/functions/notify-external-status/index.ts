import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SourceConfig = {
  webhookUrl?: string;
  callbackKey?: string;
};

function configFor(source: string): SourceConfig {
  switch (source) {
    case "fleetdesk":
      return {
        webhookUrl: Deno.env.get("FLEETDESK_WEBHOOK_URL"),
        callbackKey: Deno.env.get("FLEETDESK_CALLBACK_KEY"),
      };
    case "wedo-crm":
      return {
        webhookUrl: Deno.env.get("WEDO_CRM_WEBHOOK_URL"),
        callbackKey: Deno.env.get("WEDO_CRM_CALLBACK_KEY"),
      };
    default:
      return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
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
        console.error("[notify-external-status] task access check failed", accessError);
        return json({ error: "task access check failed" }, 500);
      }
      if (!hasAccess) return json({ error: "forbidden" }, 403);
    }

    // Resolve external source + ref. Prefer tasks table; fall back to legacy link table for fleetdesk.
    let externalSource: string | null = null;
    let externalRef: string | null = null;

    const { data: t } = await admin
      .from("tasks")
      .select("external_ref, external_source")
      .eq("id", task_id)
      .maybeSingle();

    if (t?.external_source && t?.external_ref) {
      externalSource = t.external_source;
      externalRef = t.external_ref;
    } else {
      const { data: link } = await admin
        .from("fleetdesk_task_links")
        .select("external_ref")
        .eq("task_id", task_id)
        .maybeSingle();
      if (link?.external_ref) {
        externalSource = "fleetdesk";
        externalRef = link.external_ref;
      }
    }

    if (!externalSource || !externalRef) {
      console.log("[notify-external-status] No external link for task", task_id);
      return json({ ok: true, skipped: true });
    }

    const cfg = configFor(externalSource);
    if (!cfg.webhookUrl || !cfg.callbackKey) {
      console.error(
        `[notify-external-status] Missing webhook/key for source=${externalSource}`,
      );
      return json({ ok: false, error: `No webhook configured for ${externalSource}` }, 500);
    }

    const status = completed ? "done" : "todo";
    const payload = {
      external_ref: externalRef,
      source: externalSource,
      status,
      completed_at: completed ? (completed_at ?? new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-callback-key": cfg.callbackKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(
        `[notify-external-status] Webhook failed source=${externalSource}`,
        res.status,
        text,
      );
      return json({ ok: false, status: res.status, body: text }, 502);
    }

    console.log("[notify-external-status] Sent", externalSource, externalRef, status);
    return json({ ok: true, source: externalSource, external_ref: externalRef, status });
  } catch (err) {
    console.error("[notify-external-status] Error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
