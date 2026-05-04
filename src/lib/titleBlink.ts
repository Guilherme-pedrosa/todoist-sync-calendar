/**
 * Pisca o título da aba quando a janela está oculta/sem foco,
 * para chamar atenção sobre novas mensagens não lidas.
 */

let originalTitle: string | null = null;
let intervalId: number | null = null;
let unreadCount = 0;
let visibilityHandler: (() => void) | null = null;
let focusHandler: (() => void) | null = null;

function ensureOriginal() {
  if (originalTitle === null) {
    originalTitle = document.title;
  }
}

function restore() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  if (originalTitle !== null) {
    document.title = originalTitle;
  }
}

function start() {
  ensureOriginal();
  if (intervalId !== null) return;
  let toggle = false;
  intervalId = window.setInterval(() => {
    toggle = !toggle;
    document.title = toggle
      ? `(${unreadCount}) 💬 Nova mensagem`
      : originalTitle || 'TaskFlow';
  }, 1000);
}

function attachListeners() {
  if (visibilityHandler) return;
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      // user voltou: limpa
      clearTabBlink();
    }
  };
  focusHandler = () => clearTabBlink();
  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('focus', focusHandler);
}

export function notifyTabUnread() {
  if (typeof window === 'undefined') return;
  attachListeners();
  // Só pisca se a aba não estiver visível/focada
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  unreadCount += 1;
  start();
}

export function clearTabBlink() {
  unreadCount = 0;
  restore();
}
