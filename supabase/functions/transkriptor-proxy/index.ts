import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TRANSKRIPTOR_BASE = "https://api.tor.app/developer";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

function formatMeetingDate(raw?: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "Data não informada";
  const asNum = typeof raw === "number" ? raw : Number(raw);
  let d: Date;
  if (Number.isFinite(asNum) && asNum > 1_000_000_000) {
    d = new Date(asNum < 1e12 ? asNum * 1000 : asNum);
  } else {
    d = new Date(String(raw));
  }
  if (isNaN(d.getTime())) return "Data não informada";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

async function prependCoverToPdf(
  pdfBytes: Uint8Array,
  title: string,
  dateLabel: string,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const helv = await out.embedFont(StandardFonts.Helvetica);
  const helvBold = await out.embedFont(StandardFonts.HelveticaBold);

  // Cover page (A4)
  const page = out.addPage([595.28, 841.89]);
  const { width, height } = page;

  // Accent bar
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: rgb(1, 0.42, 0.13) });

  // Label
  page.drawText("REUNIÃO TRANSCRITA", {
    x: 56, y: height - 120, size: 11, font: helvBold, color: rgb(0.45, 0.45, 0.45),
  });

  // Title (wrap)
  const maxWidth = width - 112;
  const titleSize = 26;
  const words = (title || "Sem título").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const trial = current ? current + " " + w : w;
    if (helvBold.widthOfTextAtSize(trial, titleSize) > maxWidth) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);

  let y = height - 160;
  for (const line of lines.slice(0, 6)) {
    page.drawText(line, { x: 56, y, size: titleSize, font: helvBold, color: rgb(0.08, 0.08, 0.1) });
    y -= titleSize + 6;
  }

  // Divider
  y -= 20;
  page.drawRectangle({ x: 56, y, width: maxWidth, height: 1, color: rgb(0.85, 0.85, 0.85) });

  // Date block
  y -= 40;
  page.drawText("Data da reunião", {
    x: 56, y, size: 10, font: helvBold, color: rgb(0.45, 0.45, 0.45),
  });
  y -= 22;
  page.drawText(dateLabel, {
    x: 56, y, size: 16, font: helv, color: rgb(0.1, 0.1, 0.12),
  });

  // Footer
  page.drawText("Transcrição gerada via Transkriptor", {
    x: 56, y: 48, size: 9, font: helv, color: rgb(0.55, 0.55, 0.55),
  });

  // Append original PDF pages
  try {
    const original = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const copied = await out.copyPages(original, original.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  } catch (e) {
    console.error("Failed to load original PDF, returning cover only:", e);
  }

  return await out.save();
}

async function getUserKey(req: Request): Promise<{ apiKey?: string; error?: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: json({ error: "Missing authorization" }, 401) };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: json({ error: "Unauthenticated" }, 401) };

  const { data, error } = await supabase
    .from("transkriptor_keys")
    .select("api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: json({ error: error.message }, 500) };
  if (!data?.api_key) return { error: json({ error: "no_api_key" }, 400) };

  return { apiKey: data.api_key };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "list";

    const { apiKey, error } = await getUserKey(req);
    if (error) return error;

    const baseHeaders = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    if (action === "list") {
      const r = await fetch(`${TRANSKRIPTOR_BASE}/files`, { headers: baseHeaders });
      const text = await r.text();
      if (!r.ok) return json({ error: `Transkriptor ${r.status}: ${text}` }, r.status);
      try {
        const parsed = JSON.parse(text);
        const sample = Array.isArray(parsed)
          ? parsed[0]
          : parsed?.files?.[0] ?? parsed?.data?.[0] ?? parsed?.results?.[0];
        console.log("transkriptor sample item keys:", sample ? Object.keys(sample) : "none");
        console.log("transkriptor sample item:", JSON.stringify(sample));
        return json(parsed);
      } catch {
        return json({ raw: text });
      }
    }

    if (action === "export") {
      const body = await req.json().catch(() => ({}));
      const {
        order_id,
        export_type = "txt",
        include_speaker_names = true,
        include_timestamps = false,
        merge_same_speaker_segments = true,
        is_single_paragraph = false,
        paragraph_size = 4,
      } = body ?? {};

      if (!order_id) return json({ error: "order_id required" }, 400);

      const r = await fetch(
        `${TRANSKRIPTOR_BASE}/files/${encodeURIComponent(order_id)}/content/export`,
        {
          method: "POST",
          headers: baseHeaders,
          body: JSON.stringify({
            export_type,
            include_speaker_names,
            include_timestamps,
            merge_same_speaker_segments,
            is_single_paragraph,
            paragraph_size,
          }),
        }
      );

      if (!r.ok) {
        const text = await r.text();
        return json({ error: `Transkriptor ${r.status}: ${text}` }, r.status);
      }

      const respContentType = r.headers.get("content-type") ?? "";
      console.log("export response content-type:", respContentType);

      // Transkriptor often returns JSON with a signed download URL instead of raw bytes
      if (respContentType.includes("application/json")) {
        const data = await r.json();
        console.log("export json keys:", Object.keys(data ?? {}));
        const downloadUrl =
          data?.presignedUrl ||
          data?.presigned_url ||
          data?.url ||
          data?.download_url ||
          data?.file_url ||
          data?.signed_url ||
          data?.data?.url ||
          data?.data?.download_url ||
          data?.data?.presignedUrl;

        // If only inline content is available (txt), return it directly
        if (!downloadUrl && typeof data?.content === "string") {
          const bytes = new TextEncoder().encode(data.content);
          return json({
            base64: bytesToBase64(bytes),
            contentType: "text/plain; charset=utf-8",
            source: "inline",
          });
        }

        if (downloadUrl) {
          const fileResp = await fetch(downloadUrl);
          if (!fileResp.ok) {
            const t = await fileResp.text();
            return json({ error: `Download failed ${fileResp.status}: ${t}` }, 500);
          }
          const buf = new Uint8Array(await fileResp.arrayBuffer());
          const b64 = bytesToBase64(buf);
          const ct = fileResp.headers.get("content-type") ?? "application/octet-stream";
          return json({ base64: b64, contentType: ct, source: "url" });
        }

        // No URL found — return the JSON for debugging
        return json({ error: "no_download_url", payload: data }, 500);
      }

      // Raw bytes path
      const buf = new Uint8Array(await r.arrayBuffer());
      const b64 = bytesToBase64(buf);
      return json({ base64: b64, contentType: respContentType || "application/octet-stream", source: "raw" });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
