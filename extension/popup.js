const $ = (id) => document.getElementById(id);

// Guard: chrome.runtime only exists when popup is opened via the extension icon
if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
  document.body.innerHTML =
    '<div style="padding:20px;font-family:sans-serif;color:#ef4444;font-size:13px;line-height:1.5">' +
    '<strong>Contexto inválido.</strong><br/><br/>Abra este popup clicando no ícone da extensão <strong>TaskFlow Tracker</strong> na barra do Chrome — não abra o arquivo HTML diretamente.' +
    '</div>';
  throw new Error("not in extension context");
}

function show(paired) {
  $("paired").style.display = paired ? "block" : "none";
  $("unpaired").style.display = paired ? "none" : "block";
}

function setMsg(text, kind) {
  $("msg").textContent = text || "";
  $("msg").className = kind || "";
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
  // strip ALL whitespace (spaces, newlines, tabs) — base64 is whitespace-safe
  const raw = $("token").value.replace(/\s+/g, "");
  setMsg("");
  if (!raw) {
    setMsg("Cole o código primeiro.", "err");
    return;
  }

  let payload;
  try {
    let txt = raw;
    if (!raw.startsWith("{")) {
      txt = atob(raw);
    }
    payload = JSON.parse(txt);
  } catch (e) {
    setMsg("Código inválido (não é JSON nem base64). Gere de novo no app.", "err");
    console.error("[TaskFlow] parse error:", e);
    return;
  }

  if (!payload.access_token || !payload.workspace_id) {
    setMsg("Código incompleto: faltam access_token ou workspace_id.", "err");
    return;
  }

  setMsg("Conectando...", "");
  $("pairBtn").disabled = true;

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "pair",
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at || (Date.now() + 50 * 60 * 1000),
      workspace_id: payload.workspace_id,
    });
    console.log("[TaskFlow] pair result:", resp);
    if (resp?.ok) {
      setMsg("Conectado! Sessão iniciada.", "ok");
      setTimeout(refresh, 400);
    } else {
      setMsg("Erro: " + (resp?.error || "falha desconhecida"), "err");
    }
  } catch (e) {
    setMsg("Erro: " + (e?.message || e), "err");
    console.error("[TaskFlow] pair error:", e);
  } finally {
    $("pairBtn").disabled = false;
  }
});

$("unpairBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "unpair" });
  refresh();
});

$("pingBtn").addEventListener("click", async () => {
  setMsg("Enviando ping...", "");
  const r = await chrome.runtime.sendMessage({ type: "ping_now" });
  setMsg(r?.ok ? "Ping ok!" : ("Erro: " + (r?.error || "?")), r?.ok ? "ok" : "err");
  refresh();
});

refresh();
