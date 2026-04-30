// Edge Function: send-push
// Envia Web Push notifications usando VAPID + AES128GCM (Web Push protocol).
// Chamada de duas formas:
//   1) Por usuário autenticado: { test: true } → envia notif de teste para si mesmo
//   2) Internamente (com service role): { user_ids: string[], title, body, url, tag }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@taskflow.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

interface Payload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

async function sendToUsers(userIds: string[], payload: Payload) {
  if (!userIds.length) return { sent: 0, failed: 0 };

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error) throw error;
  if (!subs?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const toDelete: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }
        );
        sent++;
      } catch (e: any) {
        failed++;
        const status = e?.statusCode;
        // 404/410 = subscription expirada, remover
        if (status === 404 || status === 410) toDelete.push(s.id);
        console.error("[send-push] error", status, e?.body || e?.message);
      }
    })
  );

  if (toDelete.length) {
    await admin.from("push_subscriptions").delete().in("id", toDelete);
  }

  return { sent, failed, removed: toDelete.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // === Caminho 1: chamada interna com service role ===
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceRole =
      authHeader.includes(SERVICE_ROLE) ||
      req.headers.get("x-internal-key") === SERVICE_ROLE;

    if (isServiceRole && Array.isArray(body.user_ids)) {
      const result = await sendToUsers(body.user_ids, {
        title: body.title || "TaskFlow",
        body: body.body || "",
        url: body.url || "/today",
        tag: body.tag,
        icon: body.icon,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Caminho 2: chamada autenticada do usuário (teste) ===
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.test) {
      const result = await sendToUsers([userData.user.id], {
        title: "TaskFlow",
        body: "✅ Notificações ativadas! Você vai receber alertas aqui.",
        url: "/today",
        tag: "taskflow-test",
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "missing test or user_ids" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[send-push] fatal", e);
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
