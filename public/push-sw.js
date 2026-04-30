// Service worker MÍNIMO — apenas para receber push notifications.
// NÃO faz cache de nenhum recurso (não interfere no preview Lovable).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Recebe a notificação push e exibe
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'TaskFlow', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'TaskFlow';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/today', ...(data.data || {}) },
    requireInteraction: !!data.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Ao clicar na notificação, foca aba existente ou abre nova
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/today';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          try {
            const u = new URL(client.url);
            const target = new URL(url, self.location.origin);
            if (u.origin === target.origin) {
              client.navigate(target.toString());
              return client.focus();
            }
          } catch {}
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
