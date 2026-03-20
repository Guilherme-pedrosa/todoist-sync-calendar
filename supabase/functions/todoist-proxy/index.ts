import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TODOIST_API_KEY = Deno.env.get("TODOIST_API_KEY");
  if (!TODOIST_API_KEY) {
    return new Response(JSON.stringify({ error: "TODOIST_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint") || "projects";

  // Try both API versions
  const results: Record<string, unknown> = {};

  for (const version of ["api/v1", "rest/v2"]) {
    try {
      const apiUrl = `https://api.todoist.com/${version}/${endpoint}`;
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${TODOIST_API_KEY}` },
      });
      const text = await res.text();
      results[version] = { status: res.status, body: text.substring(0, 500) };
    } catch (e) {
      results[version] = { error: String(e) };
    }
  }

  // Also show token length for debugging (NOT the token itself)
  results.token_length = TODOIST_API_KEY.length;
  results.token_prefix = TODOIST_API_KEY.substring(0, 4) + "...";

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
