/* Pokza — service worker Web Push.
 *
 * VOLONTAIREMENT limité au push : aucun handler `fetch`, donc AUCUN cache de l'app. On évite ainsi
 * de recréer le problème de « version figée » (le shell resterait bloqué sur un ancien build). La
 * fraîcheur reste gérée par le rechargement normal / le CDN.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: 'Pokza', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Pokza';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag, // regroupe les notifs similaires (ex: plusieurs likes d'une même main)
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && targetUrl) {
            try {
              await client.navigate(targetUrl);
            } catch (_e) {
              /* navigation cross-origin impossible : on garde le focus */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })()
  );
});
