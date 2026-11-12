// Service worker: shows Daiboju alerts as notifications and opens the next-steps page on tap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Daiboju', body: event.data?.text() };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Daiboju', {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'daiboju',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open a page of this app, whatever the push payload says.
  let url = new URL('./', self.registration.scope).href;
  try {
    const target = new URL(event.notification.data?.url || './', self.registration.scope);
    if (target.href.startsWith(self.registration.scope)) url = target.href;
  } catch { /* keep the default */ }
  event.waitUntil(self.clients.openWindow(url));
});

// The browser can replace a push subscription at any time. Re-subscribe and tell the API,
// otherwise alerts would silently stop. Uses what the sign-up page stored on this device.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open('daiboju');
    const saved = await cache.match('push-registration');
    if (!saved) return;
    const reg = await saved.json();
    const sub = event.newSubscription || await self.registration.pushManager.subscribe(event.oldSubscription.options);
    const res = await fetch(`${reg.api}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'webpush', contact: sub.toJSON(), lang: reg.lang, pref: reg.pref, drill: reg.drill }),
    });
    if (!res.ok) return;
    const data = await res.json();
    // Remove the old record now rather than waiting for a failed delivery.
    await fetch(`${reg.api}/api/unsubscribe?id=${encodeURIComponent(reg.id)}&t=${encodeURIComponent(reg.t)}`, { method: 'POST' }).catch(() => {});
    await cache.put('push-registration', new Response(JSON.stringify({ ...reg, id: data.id, t: data.unsubToken })));
  })());
});
