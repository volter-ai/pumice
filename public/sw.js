// Pumice service worker — makes the app installable + offline-capable.
// Strategy: cache the app shell on install; stale-while-revalidate for same-origin GETs
// (hashed Vite assets are immutable, so cache hits are safe); never cache /api (live vault).
const CACHE = 'pumice-v1';
const SHELL = ['./', './app.html', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // live vault data — always network
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const network = fetch(e.request).then((resp) => { if (resp && resp.ok) cache.put(e.request, resp.clone()); return resp; }).catch(() => cached);
      return cached || network;
    })
  );
});
