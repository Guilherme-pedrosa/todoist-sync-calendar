import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Chave pública VAPID — pode (e deve) ficar no client.
const VAPID_PUBLIC_KEY =
  'BGwilt60gWgZRF0BoV_JLaAi2c2Vax-pop3v_4Cn_a0V_4eBMBxySjthfp2BOnaCV5arOihjPJAwgY4JxFTgdTw';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type PushState = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'loading';

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>('loading');

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const refresh = useCallback(async () => {
    if (!supported) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'subscribed' : 'unsubscribed');
    } catch {
      setState('unsubscribed');
    }
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported || !user) return false;
    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'unsubscribed');
        return false;
      }

      const reg =
        (await navigator.serviceWorker.getRegistration('/push-sw.js')) ||
        (await navigator.serviceWorker.register('/push-sw.js', { scope: '/' }));

      // Garante que está ativo
      if (reg.installing || reg.waiting) {
        await new Promise<void>((resolve) => {
          const sw = reg.installing || reg.waiting;
          if (!sw) return resolve();
          sw.addEventListener('statechange', () => {
            if (sw.state === 'activated') resolve();
          });
        });
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const json = sub.toJSON() as any;
      const endpoint = json.endpoint || sub.endpoint;
      const p256dh = json.keys?.p256dh || arrayBufferToBase64Url(sub.getKey('p256dh'));
      const auth = json.keys?.auth || arrayBufferToBase64Url(sub.getKey('auth'));

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        );

      if (error) throw error;
      setState('subscribed');
      return true;
    } catch (e) {
      console.error('[push] subscribe error', e);
      await refresh();
      return false;
    }
  }, [supported, user, refresh]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }
      setState('unsubscribed');
    } catch (e) {
      console.error('[push] unsubscribe error', e);
      await refresh();
    }
  }, [supported, refresh]);

  const sendTest = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { test: true },
    });
    if (error) throw error;
    return data;
  }, []);

  return { state, supported, subscribe, unsubscribe, sendTest, refresh };
}
