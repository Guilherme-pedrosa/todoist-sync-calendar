/**
 * Browser-level notifications: permission + system tray notifications + audible chime.
 */

const PERMISSION_ASKED_KEY = 'taskflow:notif_permission_asked';

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function maybeAutoRequestPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  if (localStorage.getItem(PERMISSION_ASKED_KEY)) return;
  // Defer slightly so it doesn't fire on first paint
  setTimeout(() => {
    localStorage.setItem(PERMISSION_ASKED_KEY, '1');
    Notification.requestPermission().catch(() => {});
  }, 4000);
}

export function showSystemNotification(opts: {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  // Only show when document is hidden — avoid double-noise when user is looking
  if (document.visibilityState === 'visible' && document.hasFocus()) return false;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

// --- Audible chime (WebAudio so it's reliably loud, no asset needed) ---

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

export function playChime(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const notes = [
    { freq: 880, t: 0 },
    { freq: 1320, t: 0.12 },
  ];
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(0.35, now + n.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + 0.4);
  }
}
