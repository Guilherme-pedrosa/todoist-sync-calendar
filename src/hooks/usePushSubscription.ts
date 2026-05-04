import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SW_PATH = '/push-sw.js';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function fetchVapidKey(): Promise<string | null> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push?action=vapid-key`;
    const r = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    if (!r.ok) return null;
    const json = await r.json();
    return json?.vapid_public_key || null;
  } catch {
    return null;
  }
}

export type PushStatus = 'unsupported' | 'denied' | 'granted' | 'default' | 'loading';

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      setIsSubscribed(false);
      return;
    }
    const perm = Notification.permission as PushStatus;
    setStatus(perm);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = await reg?.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (busy) return { ok: false, error: 'Em andamento' };
    setBusy(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return { ok: false, error: 'Navegador não suporta notificações push' };
      }
      const perm = await Notification.requestPermission();
      setStatus(perm as PushStatus);
      if (perm !== 'granted') return { ok: false, error: 'Permissão negada' };

      const registration =
        (await navigator.serviceWorker.getRegistration(SW_PATH)) ||
        (await navigator.serviceWorker.register(SW_PATH));
      await navigator.serviceWorker.ready;

      const vapid = await fetchVapidKey();
      if (!vapid) return { ok: false, error: 'Servidor de push indisponível' };

      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid).buffer as ArrayBuffer,
        });
      }

      const json = sub.toJSON();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { ok: false, error: 'Sessão expirada' };

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: userData.user.id,
            endpoint: sub.endpoint,
            p256dh: json.keys?.p256dh || '',
            auth: json.keys?.auth || '',
            user_agent: navigator.userAgent,
          },
          { onConflict: 'endpoint' },
        );
      if (error) return { ok: false, error: error.message };

      setIsSubscribed(true);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Falha ao registrar' };
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Falha' };
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: { test: true },
      });
      if (error) return { ok: false, error: error.message };
      if (data?.no_subscribers) return { ok: false, error: 'Nenhum dispositivo registrado' };
      if ((data?.sent ?? 0) === 0) return { ok: false, error: 'Falhou ao entregar' };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Falha' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, isSubscribed, busy, subscribe, unsubscribe, sendTest, refresh };
}
