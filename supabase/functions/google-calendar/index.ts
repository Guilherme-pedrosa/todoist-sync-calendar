import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonBody = Record<string, unknown>;

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJsonBody = async (req: Request): Promise<JsonBody> => {
  if (req.method === "GET" || req.method === "OPTIONS") return {};

  try {
    return (await req.json()) as JsonBody;
  } catch {
    return {};
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: "Configuração do servidor inválida" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Usuário inválido" }, 401);
    }

    const url = new URL(req.url);
    const body = await parseJsonBody(req);
    const action = (url.searchParams.get("action") || String(body.action || "")).trim();

    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (action === "connect-url") {
      if (!googleClientId) {
        return jsonResponse({ error: "Google OAuth não configurado no servidor" }, 500);
      }

      const redirectUri =
        url.searchParams.get("redirectUri") ||
        (typeof body.redirectUri === "string" ? body.redirectUri : "");

      if (!redirectUri) {
        return jsonResponse({ error: "redirectUri é obrigatório" }, 400);
      }

      const params = new URLSearchParams({
        client_id: googleClientId,
        redirect_uri: redirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent select_account",
        include_granted_scopes: "true",
        scope: "https://www.googleapis.com/auth/calendar.events",
        state: user.id,
      });

      const hostedDomain =
        typeof body.hd === "string"
          ? body.hd.trim()
          : typeof url.searchParams.get("hd") === "string"
            ? String(url.searchParams.get("hd") || "").trim()
            : "";

      if (hostedDomain) {
        params.set("hd", hostedDomain);
      }

      return jsonResponse({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      });
    }

    if (action === "exchange-code") {
      if (!googleClientId || !googleClientSecret) {
        return jsonResponse({ error: "Google OAuth não configurado no servidor" }, 500);
      }

      const code = typeof body.code === "string" ? body.code : "";
      const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri : "";

      if (!code || !redirectUri) {
        return jsonResponse({ error: "code e redirectUri são obrigatórios" }, 400);
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokenPayload = await tokenRes.json();
      if (!tokenRes.ok || tokenPayload.error || !tokenPayload.access_token) {
        return jsonResponse(
          { error: "Falha ao trocar código por token Google", details: tokenPayload },
          400,
        );
      }

      const { data: currentToken } = await supabase
        .from("google_tokens")
        .select("refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();

      const refreshToken = tokenPayload.refresh_token ?? currentToken?.refresh_token ?? null;

      const { error: upsertError } = await supabase.from("google_tokens").upsert(
        {
          user_id: user.id,
          access_token: tokenPayload.access_token,
          refresh_token: refreshToken,
          expires_at: new Date(Date.now() + Number(tokenPayload.expires_in || 3600) * 1000).toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (upsertError) {
        return jsonResponse({ error: "Falha ao salvar token Google", details: upsertError.message }, 400);
      }

      return jsonResponse({ success: true });
    }

    if (action === "disconnect") {
      const { data: existing } = await supabase
        .from("google_tokens")
        .select("refresh_token, access_token")
        .eq("user_id", user.id)
        .maybeSingle();

      const tokenToRevoke = existing?.refresh_token || existing?.access_token;

      if (tokenToRevoke) {
        try {
          await fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            },
          );
          // Ignora erro: token pode já ter sido revogado
        } catch {
          // noop
        }
      }

      const { error: deleteError } = await supabase
        .from("google_tokens")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        return jsonResponse({ error: "Falha ao desconectar Google Calendar", details: deleteError.message }, 400);
      }

      return jsonResponse({ success: true });
    }

    const { data: tokenData } = await supabase
      .from("google_tokens")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!tokenData) {
      return jsonResponse({ error: "Google Calendar não conectado", code: "NO_TOKEN" }, 400);
    }

    let accessToken = tokenData.access_token;

    if (new Date(tokenData.expires_at) <= new Date()) {
      if (!tokenData.refresh_token) {
        return jsonResponse(
          { error: "Token expirado, reconecte o Google Calendar", code: "TOKEN_EXPIRED" },
          400,
        );
      }

      if (!googleClientId || !googleClientSecret) {
        return jsonResponse({ error: "Google OAuth não configurado no servidor" }, 500);
      }

      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: tokenData.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      const refreshData = await refreshRes.json();
      if (!refreshRes.ok || refreshData.error || !refreshData.access_token) {
        return jsonResponse(
          { error: "Falha ao renovar token Google", details: refreshData },
          400,
        );
      }

      accessToken = refreshData.access_token;
      await supabase
        .from("google_tokens")
        .update({
          access_token: refreshData.access_token,
          expires_at: new Date(Date.now() + Number(refreshData.expires_in || 3600) * 1000).toISOString(),
        })
        .eq("user_id", user.id);
    }

    const calendarBase = "https://www.googleapis.com/calendar/v3";
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    switch (action) {
      case "list-events": {
        const timeMin = url.searchParams.get("timeMin") || new Date().toISOString();
        const timeMax = url.searchParams.get("timeMax");
        const maxResults = url.searchParams.get("maxResults") || "2500";

        // Pagina todos os eventos da janela solicitada
        let pageToken: string | undefined;
        const allItems: unknown[] = [];
        let safety = 20;

        do {
          const params = new URLSearchParams({
            timeMin,
            singleEvents: "true",
            orderBy: "startTime",
            maxResults,
          });
          if (timeMax) params.set("timeMax", timeMax);
          if (pageToken) params.set("pageToken", pageToken);

          const res = await fetch(`${calendarBase}/calendars/primary/events?${params.toString()}`, { headers });
          const data = await res.json();
          if (!res.ok) return jsonResponse(data, 400);

          if (Array.isArray(data.items)) allItems.push(...data.items);
          pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
          safety -= 1;
        } while (pageToken && safety > 0);

        return jsonResponse({ items: allItems });
      }

      case "create-event": {
        const normalizeTime = (t: unknown, fallback: string): string => {
          const s = typeof t === "string" ? t.trim() : "";
          if (!s) return fallback;
          const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
          if (!m) return fallback;
          const hh = m[1].padStart(2, "0");
          const mm = m[2];
          const ss = m[3] || "00";
          return `${hh}:${mm}:${ss}`;
        };
        const startTime = normalizeTime(body.time, "09:00:00");
        const endTime = normalizeTime(body.endTime ?? body.time, "10:00:00");
        const taskId = typeof body.taskId === "string" ? body.taskId : "";

        const buildEvent = () => ({
          summary: body.title,
          description: body.description || "",
          start: body.allDay
            ? { date: body.date }
            : {
                dateTime: `${body.date}T${startTime}`,
                timeZone: body.timeZone || "America/Sao_Paulo",
              },
          end: body.allDay
            ? { date: body.date }
            : {
                dateTime: `${body.date}T${endTime}`,
                timeZone: body.timeZone || "America/Sao_Paulo",
              },
          reminders: { useDefault: true },
          extendedProperties: taskId ? { private: { taskId } } : undefined,
        });

        // IDEMPOTÊNCIA: se já existe evento com este taskId, faça PATCH em vez de INSERT.
        // Isto previne duplicatas mesmo se o cliente perdeu o googleEventId localmente.
        if (taskId) {
          const lookupParams = new URLSearchParams({
            privateExtendedProperty: `taskId=${taskId}`,
            maxResults: "10",
            showDeleted: "false",
            singleEvents: "true",
          });
          const lookupRes = await fetch(
            `${calendarBase}/calendars/primary/events?${lookupParams.toString()}`,
            { headers },
          );
          if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            const items: any[] = Array.isArray(lookupData.items) ? lookupData.items : [];
            if (items.length >= 1) {
              // Mantém o primeiro, deleta extras (dedupe legacy).
              const keep = items[0];
              for (const extra of items.slice(1)) {
                if (extra?.id) {
                  await fetch(
                    `${calendarBase}/calendars/primary/events/${extra.id}`,
                    { method: "DELETE", headers },
                  );
                }
              }
              const patchRes = await fetch(
                `${calendarBase}/calendars/primary/events/${keep.id}`,
                { method: "PATCH", headers, body: JSON.stringify(buildEvent()) },
              );
              const patched = await patchRes.json();
              return jsonResponse(patched, patchRes.ok ? 200 : 400);
            }
          }
        }

        const res = await fetch(`${calendarBase}/calendars/primary/events`, {
          method: "POST",
          headers,
          body: JSON.stringify(buildEvent()),
        });

        const data = await res.json();
        return jsonResponse(data, res.ok ? 200 : 400);
      }

      case "find-by-task": {
        const taskId = typeof body.taskId === "string" ? body.taskId : url.searchParams.get("taskId") || "";
        if (!taskId) return jsonResponse({ error: "taskId é obrigatório" }, 400);
        const lookupParams = new URLSearchParams({
          privateExtendedProperty: `taskId=${taskId}`,
          maxResults: "10",
          showDeleted: "false",
          singleEvents: "true",
        });
        const res = await fetch(
          `${calendarBase}/calendars/primary/events?${lookupParams.toString()}`,
          { headers },
        );
        const data = await res.json();
        return jsonResponse(data, res.ok ? 200 : 400);
      }

      case "cleanup-duplicates": {
        // Lista próximos 90 dias, agrupa por (summary + start), mantém 1, deleta resto.
        const now = new Date();
        const endRange = new Date();
        endRange.setDate(endRange.getDate() + 90);
        const dryRun = body.dryRun === true || url.searchParams.get("dryRun") === "true";

        let pageToken: string | undefined;
        const all: any[] = [];
        let safety = 20;
        do {
          const params = new URLSearchParams({
            timeMin: now.toISOString(),
            timeMax: endRange.toISOString(),
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "2500",
          });
          if (pageToken) params.set("pageToken", pageToken);
          const res = await fetch(
            `${calendarBase}/calendars/primary/events?${params.toString()}`,
            { headers },
          );
          if (!res.ok) {
            const err = await res.json();
            return jsonResponse(err, 400);
          }
          const data = await res.json();
          if (Array.isArray(data.items)) all.push(...data.items);
          pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
          safety -= 1;
        } while (pageToken && safety > 0);

        const groups = new Map<string, any[]>();
        for (const ev of all) {
          const summary = (ev.summary || "").trim().toLowerCase();
          const start = ev.start?.dateTime || ev.start?.date || "";
          if (!summary || !start) continue;
          const key = `${summary}|${start}`;
          const arr = groups.get(key) || [];
          arr.push(ev);
          groups.set(key, arr);
        }

        let toDelete = 0;
        let toKeep = 0;
        const deletions: string[] = [];
        for (const [, arr] of groups) {
          if (arr.length < 2) {
            toKeep += arr.length;
            continue;
          }
          // Prefere o que tem extendedProperties.private.taskId; senão o mais antigo.
          arr.sort((a, b) => {
            const aHas = a.extendedProperties?.private?.taskId ? 1 : 0;
            const bHas = b.extendedProperties?.private?.taskId ? 1 : 0;
            if (aHas !== bHas) return bHas - aHas;
            return (a.created || "").localeCompare(b.created || "");
          });
          toKeep += 1;
          for (const extra of arr.slice(1)) {
            toDelete += 1;
            if (extra?.id) deletions.push(extra.id);
          }
        }

        if (dryRun) {
          return jsonResponse({ toDelete, toKeep, totalScanned: all.length });
        }

        let deleted = 0;
        for (const id of deletions) {
          const r = await fetch(
            `${calendarBase}/calendars/primary/events/${id}`,
            { method: "DELETE", headers },
          );
          if (r.ok || r.status === 410) deleted += 1;
        }
        return jsonResponse({ deleted, kept: toKeep, totalScanned: all.length });
      }

      case "update-event": {
        const eventId = typeof body.eventId === "string" ? body.eventId : "";
        if (!eventId) return jsonResponse({ error: "eventId é obrigatório" }, 400);

        const updates = body;
        const event: Record<string, unknown> = {};

        if (updates.title) event.summary = updates.title;
        if (updates.description !== undefined) event.description = updates.description;

        // Atualiza start/end se qualquer parte do horário mudou (data, hora, duração ou allDay)
        const hasTimeChange =
          updates.date !== undefined ||
          updates.time !== undefined ||
          updates.endTime !== undefined ||
          updates.allDay !== undefined ||
          updates.durationMinutes !== undefined;

        if (hasTimeChange && updates.date) {
          const normalizeTime = (t: unknown, fallback: string): string => {
            const s = typeof t === "string" ? t.trim() : "";
            if (!s) return fallback;
            const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (!m) return fallback;
            return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}`;
          };
          const startTime = normalizeTime(updates.time, "09:00:00");
          const endTime = normalizeTime(updates.endTime ?? updates.time, "10:00:00");
          event.start = updates.allDay
            ? { date: updates.date }
            : {
                dateTime: `${updates.date}T${startTime}`,
                timeZone: updates.timeZone || "America/Sao_Paulo",
              };
          event.end = updates.allDay
            ? { date: updates.date }
            : {
                dateTime: `${updates.date}T${endTime}`,
                timeZone: updates.timeZone || "America/Sao_Paulo",
              };
        }

        // Garante que o evento legado fique marcado com taskId pra próximas idempotências
        const taskId = typeof body.taskId === "string" ? body.taskId : "";
        if (taskId) {
          event.extendedProperties = { private: { taskId } };
        }

        const res = await fetch(`${calendarBase}/calendars/primary/events/${eventId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(event),
        });

        const data = await res.json();
        return jsonResponse(data, res.ok ? 200 : 400);
      }

      case "delete-event": {
        const eventId = url.searchParams.get("eventId");
        if (!eventId) return jsonResponse({ error: "eventId é obrigatório" }, 400);

        const res = await fetch(`${calendarBase}/calendars/primary/events/${eventId}`, {
          method: "DELETE",
          headers,
        });

        return jsonResponse({ success: res.ok }, res.ok ? 200 : 400);
      }

      case "complete-event": {
        const eventId = typeof body.eventId === "string" ? body.eventId : "";
        if (!eventId) return jsonResponse({ error: "eventId é obrigatório" }, 400);

        const completed = Boolean(body.completed);

        // Busca o evento atual para preservar o título original
        const getRes = await fetch(`${calendarBase}/calendars/primary/events/${eventId}`, {
          headers,
        });

        if (!getRes.ok) {
          const errPayload = await getRes.json().catch(() => null);
          return jsonResponse(
            { error: "Falha ao buscar evento no Google Calendar", details: errPayload },
            getRes.status,
          );
        }

        const currentEvent = await getRes.json();
        const currentSummary: string = currentEvent.summary || "";
        const DONE_PREFIX = "✅ ";
        const cleanSummary = currentSummary.startsWith(DONE_PREFIX)
          ? currentSummary.slice(DONE_PREFIX.length)
          : currentSummary;

        const newSummary = completed ? `${DONE_PREFIX}${cleanSummary}` : cleanSummary;

        // colorId 8 = Graphite (cinza, indica concluído); null restaura cor padrão
        const patchBody: Record<string, unknown> = {
          summary: newSummary,
          colorId: completed ? "8" : null,
        };

        const res = await fetch(`${calendarBase}/calendars/primary/events/${eventId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patchBody),
        });

        const data = await res.json();
        return jsonResponse(data, res.ok ? 200 : 400);
      }

      default:
        return jsonResponse({ error: "Ação inválida" }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});