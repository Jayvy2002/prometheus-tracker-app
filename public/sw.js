const CACHE_NAME = 'prometheus-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo.svg',
  '/offline.html',
];

// Install — pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Push — show notification when server sends a Web Push message
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'Prometheus', body: event.data.text() }; }

  const title = payload.title ?? 'Prometheus';
  const options = {
    body: payload.body ?? '',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: payload.tag ?? 'prometheus-reminder',
    data: { url: payload.url ?? '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click — focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// Fetch — stale-while-revalidate for static assets, network-only for API calls
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cache only this app's public assets. API hosts may be local or custom domains.
  // A hostname denylist can accidentally cache private responses across accounts.
  if (url.origin !== self.location.origin || event.request.headers.has('authorization')) return;

  // For navigation requests (HTML pages) — network first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  const staticAsset = STATIC_ASSETS.includes(url.pathname)
    || /^\/assets\/[^/]+\.(?:js|css|svg|png|jpe?g|webp|woff2?)$/.test(url.pathname);
  if (!staticAsset || url.search) return;

  // Only public static files use stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
