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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const targetDay = String(body.day || url.searchParams.get("day") || "").trim();

    const { data, error } = await supabase.rpc("run_activity_aggregate", {
      p_day: targetDay || null,
    });

    if (error) {
      console.error("[activity-aggregate] rpc failed", error);
      return json({ ok: false, error: error.message }, 500);
    }

    return json(data ?? { ok: true });
  } catch (err) {
    console.error("[activity-aggregate] fatal", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
});
