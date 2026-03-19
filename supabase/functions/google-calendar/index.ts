import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuário inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Get Google token for user
    const { data: tokenData } = await supabase
      .from("google_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!tokenData) {
      return new Response(
        JSON.stringify({ error: "Google Calendar não conectado", code: "NO_TOKEN" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired and refresh if needed
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) <= new Date()) {
      if (!tokenData.refresh_token) {
        return new Response(
          JSON.stringify({ error: "Token expirado, reconecte o Google Calendar", code: "TOKEN_EXPIRED" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

      if (!googleClientId || !googleClientSecret) {
        return new Response(
          JSON.stringify({ error: "Google OAuth não configurado no servidor" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
      if (refreshData.error) {
        return new Response(
          JSON.stringify({ error: "Falha ao renovar token Google", details: refreshData }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = refreshData.access_token;
      await supabase
        .from("google_tokens")
        .update({
          access_token: refreshData.access_token,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
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
        const params = new URLSearchParams({
          timeMin,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "50",
        });
        if (timeMax) params.set("timeMax", timeMax);

        const res = await fetch(`${calendarBase}/calendars/primary/events?${params}`, { headers });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create-event": {
        const body = await req.json();
        const event = {
          summary: body.title,
          description: body.description || "",
          start: body.allDay
            ? { date: body.date }
            : { dateTime: `${body.date}T${body.time || "09:00"}:00`, timeZone: body.timeZone || "America/Sao_Paulo" },
          end: body.allDay
            ? { date: body.date }
            : { dateTime: `${body.date}T${body.endTime || body.time || "10:00"}:00`, timeZone: body.timeZone || "America/Sao_Paulo" },
          reminders: { useDefault: true },
        };

        const res = await fetch(`${calendarBase}/calendars/primary/events`, {
          method: "POST",
          headers,
          body: JSON.stringify(event),
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update-event": {
        const body = await req.json();
        const { eventId, ...updates } = body;
        const event: Record<string, any> = {};
        if (updates.title) event.summary = updates.title;
        if (updates.description !== undefined) event.description = updates.description;
        if (updates.date) {
          event.start = updates.allDay
            ? { date: updates.date }
            : { dateTime: `${updates.date}T${updates.time || "09:00"}:00`, timeZone: updates.timeZone || "America/Sao_Paulo" };
          event.end = updates.allDay
            ? { date: updates.date }
            : { dateTime: `${updates.date}T${updates.endTime || updates.time || "10:00"}:00`, timeZone: updates.timeZone || "America/Sao_Paulo" };
        }

        const res = await fetch(`${calendarBase}/calendars/primary/events/${eventId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(event),
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete-event": {
        const eventId = url.searchParams.get("eventId");
        const res = await fetch(`${calendarBase}/calendars/primary/events/${eventId}`, {
          method: "DELETE",
          headers,
        });
        const text = await res.text();
        return new Response(JSON.stringify({ success: res.ok }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
