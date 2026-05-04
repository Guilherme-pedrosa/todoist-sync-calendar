const $ = (id) => document.getElementById(id);

function show(paired) {
  $("paired").style.display = paired ? "block" : "none";
  $("unpaired").style.display = paired ? "none" : "block";
}

async function refresh() {
  const status = await chrome.runtime.sendMessage({ type: "status" });
  show(!!status.paired);
  $("dot").classList.toggle("on", status.paired && !status.is_idle);
  $("dot").classList.toggle("idle", status.paired && status.is_idle);
  if (status.paired) {
    $("statusVal").textContent = status.is_idle ? "Idle" : "Ativo";
    $("wsVal").textContent = (status.workspace_id || "").slice(0, 8) + "…";
    $("sessVal").textContent = status.session_id ? (status.session_id.slice(0, 8) + "…") : "—";
  }
}

$("pairBtn").addEventListener("click", async () => {
  const raw = $("token").value.trim();
  $("msg").textContent = "";
  $("msg").className = "";
  if (!raw) return;
  let payload;
  try {
    // accepts JSON or base64-JSON
    let txt = raw;
    if (!raw.startsWith("{")) {
      try { txt = atob(raw); } catch {}
    }
    payload = JSON.parse(txt);
  } catch {
    $("msg").textContent = "Código inválido. Copie novamente do app.";
    $("msg").className = "err";
    return;
  }
  if (!payload.access_token || !payload.workspace_id) {
    $("msg").textContent = "Código incompleto.";
    $("msg").className = "err";
    return;
  }
  await chrome.runtime.sendMessage({
    type: "pair",
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at || (Date.now() + 50 * 60 * 1000),
    workspace_id: payload.workspace_id,
  });
  $("msg").textContent = "Conectado!";
  $("msg").className = "ok";
  setTimeout(refresh, 400);
});

$("unpairBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "unpair" });
  refresh();
});

$("pingBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "ping_now" });
  refresh();
});

refresh();
