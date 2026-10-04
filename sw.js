/* FrameSeal service worker: cache-first so the prototype keeps working in airplane mode once loaded. */
const CACHE = 'frameseal-v2-design';
const ASSETS = ['./', 'index.html', 'phone.html', 'desk.html', 'assets/style.css', 'assets/core.js', 'assets/phone.js', 'assets/desk.js', 'assets/landing.js', 'assets/logo.svg', 'assets/fonts/InterVariable.woff2', 'assets/icon-32.png', 'assets/icon-180.png', 'assets/icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // network-first for pages (fresh when online), cache fallback when offline; cache-first for assets
  const isPage = e.request.mode === 'navigate';
  if (isPage) {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => { const cp = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return resp; })));
  }
});
