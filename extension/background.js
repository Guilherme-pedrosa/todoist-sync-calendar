// TaskFlow Tracker — background service worker
const SUPABASE_URL = "https://scgcbifmcvazmalqqpju.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjZ2NiaWZtY3Zhem1hbHFxcGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzgwNTIsImV4cCI6MjA4OTUxNDA1Mn0.b8MMdveuH5aDHg5DjnGyut_qosiltvSMwUg66KyNAq8";

const HEARTBEAT_SECONDS = 60;
const IDLE_THRESHOLD_SECONDS = 300; // 5 min

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

async function getCfg() {
  return await chrome.storage.local.get([
    "access_token",
    "refresh_token",
    "expires_at",
    "workspace_id",
    "session_id",
    "idle_id",
    "is_idle",
    "interactions",
  ]);
}

async function setCfg(patch) {
  await chrome.storage.local.set(patch);
}

async function refreshAccessToken() {
  const { refresh_token } = await getCfg();
  if (!refresh_token) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    await setCfg({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in - 30) * 1000,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

async function getValidToken() {
  const cfg = await getCfg();
  if (!cfg.access_token) return null;
  if (cfg.expires_at && Date.now() > cfg.expires_at) {
    return await refreshAccessToken();
  }
  return cfg.access_token;
}

async function callTrack(payload) {
  const token = await getValidToken();
  if (!token) throw new Error("not paired");
  const doFetch = (tok) =>
    fetch(`${SUPABASE_URL}/functions/v1/activity-track`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok}`,
        apikey: SUPABASE_ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    const t = await refreshAccessToken();
    if (!t) throw new Error("auth expired — please re-pair");
    res = await doFetch(t);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[TaskFlow] track error", res.status, data);
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function ensureSession() {
  const cfg = await getCfg();
  if (!cfg.workspace_id) return null;
  if (cfg.session_id) return cfg.session_id;
  try {
    const r = await callTrack({ action: "start", workspace_id: cfg.workspace_id });
    if (r?.session_id) {
      await setCfg({ session_id: r.session_id });
      return r.session_id;
    }
  } catch (e) {
    console.error("[TaskFlow] ensureSession failed:", e);
    throw e;
  }
  return null;
}

async function getActiveTabUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const t = tabs[0];
    if (!t?.url) return null;
    const u = new URL(t.url);
    return `${u.hostname}${u.pathname}`.slice(0, 200);
  } catch {
    return null;
  }
}

async function sendHeartbeat() {
  const cfg = await getCfg();
  if (!cfg.workspace_id || !cfg.access_token) return;
  const sessionId = await ensureSession();
  if (!sessionId) return;
  const route = await getActiveTabUrl();
  const isActive = !cfg.is_idle;
  await callTrack({
    action: "heartbeat",
    workspace_id: cfg.workspace_id,
    session_id: sessionId,
    is_active: isActive,
    is_focused: true,
    route,
    interactions: cfg.interactions || 0,
    seconds: HEARTBEAT_SECONDS,
  });
  await setCfg({ interactions: 0 });
}

// idle handling
chrome.idle.onStateChanged.addListener(async (state) => {
  const cfg = await getCfg();
  if (!cfg.workspace_id) return;
  const sessionId = await ensureSession();
  if (!sessionId) return;

  if (state === "active") {
    if (cfg.idle_id) {
      await callTrack({
        action: "idle_end",
        workspace_id: cfg.workspace_id,
        idle_id: cfg.idle_id,
      }).catch(() => {});
      await setCfg({ idle_id: null, is_idle: false });
    }
  } else {
    // idle or locked
    if (!cfg.idle_id) {
      const r = await callTrack({
        action: "idle_start",
        workspace_id: cfg.workspace_id,
        session_id: sessionId,
      }).catch(() => null);
      await setCfg({ idle_id: r?.idle_id || null, is_idle: true });
    }
  }
});

// count interactions (tab switches as a proxy for activity)
chrome.tabs.onActivated.addListener(async () => {
  const cfg = await getCfg();
  await setCfg({ interactions: (cfg.interactions || 0) + 1 });
});

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  const cfg = await getCfg();
  await setCfg({ interactions: (cfg.interactions || 0) + 1 });
});

// alarm for heartbeat
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("heartbeat", { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("heartbeat", { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "heartbeat") sendHeartbeat();
});

// popup messaging
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "pair") {
      try {
        await setCfg({
          access_token: msg.access_token,
          refresh_token: msg.refresh_token,
          expires_at: msg.expires_at,
          workspace_id: msg.workspace_id,
          session_id: null,
          is_idle: false,
          idle_id: null,
          interactions: 0,
        });
        // try to start a session NOW so we know auth works
        const sid = await ensureSession();
        if (!sid) {
          sendResponse({ ok: false, error: "Não foi possível iniciar sessão (token inválido ou expirado). Gere um novo código." });
          return;
        }
        await sendHeartbeat();
        // make sure heartbeat alarm is registered (onInstalled doesn't fire after pair)
        chrome.alarms.create("heartbeat", { periodInMinutes: 1 });
        sendResponse({ ok: true, session_id: sid });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    } else if (msg.type === "ping_now_legacy") {} else if (msg.type === "unpair") {
      const cfg = await getCfg();
      if (cfg.session_id) {
        await callTrack({
          action: "end",
          workspace_id: cfg.workspace_id,
          session_id: cfg.session_id,
        }).catch(() => {});
      }
      await chrome.storage.local.clear();
      sendResponse({ ok: true });
    } else if (msg.type === "status") {
      const cfg = await getCfg();
      sendResponse({
        paired: !!cfg.access_token,
        workspace_id: cfg.workspace_id,
        session_id: cfg.session_id,
        is_idle: !!cfg.is_idle,
      });
    } else if (msg.type === "ping_now") {
      try {
        await sendHeartbeat();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    }
  })();
  return true;
});
