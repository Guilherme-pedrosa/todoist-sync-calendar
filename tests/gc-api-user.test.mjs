import assert from "node:assert/strict";
import { test } from "node:test";
import { createGcFetch, GC_API_USER_ID } from "../supabase/functions/_shared/gc-user.ts";

test("activity-sync entry point attributes all outgoing user and log reads", async () => {
  const { registerHooks } = await import("node:module");
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno, EdgeRuntime: globalThis.EdgeRuntime };
  let handler;
  const pending = [];
  const outgoing = [];
  const state = { status: "running", phase: "usuarios", data_inicio: "2026-09-01", data_fim: "2026-09-01", fetched: {}, bucket_state: {} };
  const chain = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: state }; }, async upsert() { return {}; } };
  globalThis.__gcTestSupabase = { from: () => chain, rpc: async () => ({ data: 0, error: null }) };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("https://esm.sh/@supabase/")) {
        return { url: "data:text/javascript,export const createClient = () => globalThis.__gcTestSupabase;", shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  globalThis.Deno = {
    env: { get: (name) => name === "SUPABASE_URL" ? "https://test.invalid" : name === "GC_API_USER_ID" ? "1023771" : "test-only" },
    serve: (value) => { handler = value; },
  };
  globalThis.EdgeRuntime = { waitUntil: (promise) => pending.push(promise) };
  globalThis.fetch = async (input) => {
    outgoing.push(new Request(input));
    return Response.json({ data: [], meta: {} });
  };
  try {
    await import("../supabase/functions/gc-sync-activity/index.ts");
    const response = await handler(new Request("https://test.invalid/function", {
      method: "POST", headers: { authorization: "Bearer test-only", "content-type": "application/json" },
      body: JSON.stringify({ continue: true }),
    }));
    assert.equal(response.status, 202);
    await Promise.all(pending);
    assert.deepEqual(outgoing.map((request) => new URL(request.url).pathname), ["/usuarios", "/logs"]);
    for (const request of outgoing) {
      assert.equal(new URL(request.url).searchParams.get("usuario_id"), GC_API_USER_ID);
      assert.equal(request.method, "GET");
    }
    assert.equal(new URL(outgoing[1].url).searchParams.get("data_inicio"), "2026-09-01");
  } finally {
    Object.assign(globalThis, saved);
    delete globalThis.__gcTestSupabase;
    hooks.deregister();
  }
});

const api = "https://api.gestaoclick.com";

test("read attribution replaces absent, blank, whitespace, master and duplicate values", async () => {
  for (const query of ["", "?usuario_id=", "?usuario_id=%20", "?usuario_id=1023771", "?usuario_id=1023771&usuario_id="]) {
    let captured;
    const gcFetch = createGcFetch(async (input) => {
      captured = new Request(input);
      return new Response("{}");
    });
    await gcFetch(api + "/vendas" + query);
    assert.deepEqual(new URL(captured.url).searchParams.getAll("usuario_id"), [GC_API_USER_ID]);
  }
});

test("JSON writes force API user while preserving seller, technician and nested data", async () => {
  const source = { usuario_id: "1023771", vendedor_id: "110", tecnico_id: "220", produtos: [{ produto: { produto_id: "30" } }] };
  let captured;
  const gcFetch = createGcFetch(async (input) => {
    captured = new Request(input);
    return new Response("{}");
  });
  for (const method of ["POST", "PUT", "PATCH"]) {
    await gcFetch(api + "/vendas/5?usuario_id=", {
      method,
      headers: { "content-type": "application/json", "access-token": "test-only", "x-correlation-id": "test" },
      body: JSON.stringify(source),
    });
    assert.equal(captured.method, method);
    assert.equal(captured.headers.get("x-correlation-id"), "test");
    assert.equal(new URL(captured.url).searchParams.get("usuario_id"), GC_API_USER_ID);
    assert.deepEqual(await captured.json(), { ...source, usuario_id: GC_API_USER_ID });
  }
  assert.equal(source.usuario_id, "1023771");
});

test("Request inputs preserve method, headers and overrides", async () => {
  let captured;
  const gcFetch = createGcFetch(async (input) => {
    captured = new Request(input);
    return new Response("{}");
  });
  const source = new Request(api + "/clientes/7?nome=Cliente&usuario_id=1023771", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test": "preserved", "content-length": "34" },
    body: JSON.stringify({ usuario_id: "", nome: "Cliente" }),
  });
  await gcFetch(source, { method: "PUT" });
  assert.equal(captured.method, "PUT");
  assert.equal(captured.headers.get("x-test"), "preserved");
  assert.equal(captured.headers.get("content-length"), null);
  assert.equal(new URL(captured.url).searchParams.get("nome"), "Cliente");
  assert.deepEqual(await captured.json(), { usuario_id: GC_API_USER_ID, nome: "Cliente" });
});

test("unrelated hosts and URLs that only contain the GC hostname are unchanged", async () => {
  for (const url of ["https://api.gestaoclick.com.example.org/vendas", "https://example.org/?redirect=api.gestaoclick.com"]) {
    const init = { headers: { "x-test": "unchanged" } };
    const gcFetch = createGcFetch(async (input, options) => {
      assert.equal(input, url);
      assert.equal(options, init);
      return new Response("{}");
    });
    await gcFetch(url, init);
  }
});

test("invalid or unsupported write bodies fail before network instead of using master", async () => {
  let calls = 0;
  const gcFetch = createGcFetch(async () => { calls++; return new Response("{}"); });
  for (const body of ["null", "[]", "invalid JSON"]) {
    await assert.rejects(gcFetch(api + "/clientes", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    }));
  }
  await assert.rejects(gcFetch(api + "/clientes", {
    method: "POST", headers: { "content-type": "text/plain" }, body: "usuario_id=",
  }));
  assert.equal(calls, 0);
});
