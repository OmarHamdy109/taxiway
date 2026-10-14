// Offline support: network-first, fall back to cache.
const C = 'taxiway-v2', FILES = ['/', '/index.html', '/style.css', '/js/data.js', '/js/audio.js', '/js/game.js', '/js/render.js', '/js/ui.js', '/manifest.json', '/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
