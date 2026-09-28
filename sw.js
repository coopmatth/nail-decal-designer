/* Nail Decal Designer service worker.
   - Precaches the app shell so the home-screen app opens instantly.
   - Cache-first for the @imgly background-removal CDN assets (library + AI
     model on staticimgly.com, jsdelivr, unpkg) so the model downloads once
     and is reused on every later use, including in the iOS home-screen app.
   - Navigations: network-first with cache fallback so updates still arrive.
*/
const CACHE = 'nail-decal-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAiAsset(url) {
  return (
    url.hostname.includes('staticimgly.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('unpkg.com')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // AI library + model files: cache-first, persist for offline reuse.
  if (isAiAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Page navigations: network-first, fall back to cached app shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    )
  );
});
