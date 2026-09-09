// Gestão Click user verified in this company's user list: API GC WEDO.
// User attribution is separate from access/secret tokens and vendedor_id/tecnico_id.
// https://gestaoclick.com/integracao_api/documentacao/index
export const GC_API_USER_ID = "1320473";

const GC_HOST = "api.gestaoclick.com";
let installed = false;

export function createGcFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return originalFetch(input, init);
    }
    if (url.hostname !== GC_HOST) return originalFetch(input, init);

    // Always replace absent, blank, duplicate or personal-user attribution.
    // A stale environment variable must never route automation to the master.
    url.searchParams.set("usuario_id", GC_API_USER_ID);
    let request = new Request(
      url,
      input instanceof Request ? new Request(input, init) : init,
    );

    if (request.body !== null && request.method !== "GET" && request.method !== "HEAD") {
      const contentType = request.headers.get("content-type") ?? "";
      if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
        throw new Error("Gestão Click API writes require a JSON object for user attribution.");
      }
      const payload: unknown = await request.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Gestão Click API writes require a JSON object for user attribution.");
      }
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      request = new Request(request, {
        headers,
        body: JSON.stringify({ ...payload, usuario_id: GC_API_USER_ID }),
      });
    }
    return originalFetch(request);
  };
}

export function installGcUsuarioId() {
  if (installed) return;
  installed = true;
  globalThis.fetch = createGcFetch(globalThis.fetch.bind(globalThis));
}
