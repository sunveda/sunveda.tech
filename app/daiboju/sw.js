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
