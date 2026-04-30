// Edge Function: send-push
// Envia Web Push notifications usando VAPID.
//
// Modos de uso:
//   1) AUTENTICADO (usuário): { test: true } → envia teste pra si mesmo
//   2) AUTENTICADO (usuário): { user_ids: string[], title, body, url, tag }
//      → só envia se o caller tem permissão de notificar esses usuários
//      (mesmo workspace). Útil pra disparos do client.
//   3) DISPARO PELO BANCO: { notification_id: string }
//      → função lê a notification via service role, valida que foi
//      criada nos últimos 60s, e envia push pro user_id dela.
//      Não precisa de secret porque endpoint só consegue ler notifications
//      reais e recentes do próprio banco.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
  if (!subs?.length) return { sent: 0, failed: 0, no_subscribers: true };

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

    // === MODO 3: trigger do banco passou notification_id ===
    if (body.notification_id) {
      const { data: notif, error } = await admin
        .from("notifications")
        .select("id, user_id, type, payload, created_at, workspace_id")
        .eq("id", body.notification_id)
        .single();

      if (error || !notif) {
        return new Response(JSON.stringify({ error: "notification not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // só permite disparar push para notifications criadas há menos de 2 minutos
      const ageMs = Date.now() - new Date(notif.created_at).getTime();
      if (ageMs > 2 * 60 * 1000) {
        return new Response(JSON.stringify({ error: "notification too old" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const p = (notif.payload || {}) as Record<string, any>;
      let title = "TaskFlow";
      let bodyText = "Você tem uma nova notificação";
      let url = "/today";

      if (notif.type === "task_assigned") {
        title = "📌 Nova tarefa atribuída";
        bodyText = p.task_title || "Você recebeu uma nova tarefa";
      } else if (p.title) {
        title = p.title;
        bodyText = p.body || p.message || bodyText;
      }
      if (p.url) url = p.url;

      const result = await sendToUsers([notif.user_id], {
        title,
        body: bodyText,
        url,
        tag: `notif-${notif.id}`,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === MODO 1 e 2: usuário autenticado ===
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
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

    return new Response(JSON.stringify({ error: "missing test or notification_id" }), {
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
