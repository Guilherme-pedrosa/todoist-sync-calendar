import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_MS = 30_000;
const IDLE_MS = 5 * 60 * 1000; // 5 min

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/activity-track`;

async function call(action: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      keepalive: true,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export function useActivityTracker(workspaceId: string | null | undefined) {
  const sessionIdRef = useRef<string | null>(null);
  const idleIdRef = useRef<string | null>(null);
  const lastInputRef = useRef<number>(Date.now());
  const interactionsRef = useRef<number>(0);
  const isIdleRef = useRef<boolean>(false);
  const isFocusedRef = useRef<boolean>(typeof document !== "undefined" ? !document.hidden : true);
  const startedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!workspaceId || startedRef.current) return;
    startedRef.current = true;

    let heartbeatTimer: number | undefined;
    let stopped = false;

    const start = async () => {
      const r = await call("start", { workspace_id: workspaceId });
      if (r?.session_id) sessionIdRef.current = r.session_id;
    };

    const beginIdle = async () => {
      if (isIdleRef.current || !sessionIdRef.current) return;
      isIdleRef.current = true;
      const r = await call("idle_start", { workspace_id: workspaceId, session_id: sessionIdRef.current });
      if (r?.idle_id) idleIdRef.current = r.idle_id;
    };

    const endIdle = async () => {
      if (!isIdleRef.current) return;
      isIdleRef.current = false;
      if (idleIdRef.current) {
        await call("idle_end", { workspace_id: workspaceId, idle_id: idleIdRef.current });
        idleIdRef.current = null;
      }
    };

    const onInput = () => {
      lastInputRef.current = Date.now();
      interactionsRef.current += 1;
      if (isIdleRef.current) endIdle();
    };

    const onVis = () => {
      isFocusedRef.current = !document.hidden;
    };

    const tick = async () => {
      if (stopped || !sessionIdRef.current) return;
      const sinceInput = Date.now() - lastInputRef.current;
      const shouldBeIdle = sinceInput >= IDLE_MS || !isFocusedRef.current;

      if (shouldBeIdle && !isIdleRef.current) await beginIdle();
      if (!shouldBeIdle && isIdleRef.current) await endIdle();

      const interactions = interactionsRef.current;
      interactionsRef.current = 0;

      await call("heartbeat", {
        workspace_id: workspaceId,
        session_id: sessionIdRef.current,
        is_active: !shouldBeIdle,
        is_focused: isFocusedRef.current,
        route: typeof window !== "undefined" ? window.location.pathname : null,
        interactions,
        seconds: HEARTBEAT_MS / 1000,
      });
    };

    const onUnload = () => {
      if (sessionIdRef.current) {
        // Best-effort end via keepalive fetch
        const data = JSON.stringify({ action: "end", workspace_id: workspaceId, session_id: sessionIdRef.current });
        try {
          navigator.sendBeacon?.(FN_URL, new Blob([data], { type: "application/json" }));
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("mousemove", onInput, { passive: true });
    window.addEventListener("keydown", onInput, { passive: true });
    window.addEventListener("click", onInput, { passive: true });
    window.addEventListener("scroll", onInput, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);

    start().then(() => {
      heartbeatTimer = window.setInterval(tick, HEARTBEAT_MS);
    });

    return () => {
      stopped = true;
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      window.removeEventListener("mousemove", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("click", onInput);
      window.removeEventListener("scroll", onInput);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
      if (sessionIdRef.current) {
        call("end", { workspace_id: workspaceId, session_id: sessionIdRef.current });
      }
      startedRef.current = false;
    };
  }, [workspaceId]);
}
