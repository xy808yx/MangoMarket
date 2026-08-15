/* Mango Market service worker. Bump CACHE on every deploy. */
const CACHE = 'mango-v11';

/* Everything the game needs to boot offline. Music MP3s are deliberately
   NOT here: they may not exist yet (they are added when the tracks are ready),
   and a missing CORE entry fails addAll and bricks the install. They are
   runtime-cached below on first successful fetch instead. */
const CORE = [
  '.',
  'index.html',
  'style.css',
  'manifest.json',
  'js/main.js',
  'js/store.js',
  'js/stand.js',
  'js/room.js',
  'js/grocery.js',
  'js/world.js',
  'js/ui.js',
  'js/engine.js',
  'js/save.js',
  'js/boards.js',
  'js/zones.js',
  'js/parent.js',
  'js/sfx.js',
  'js/data/items.js',
  'js/data/customers.js',
  'vendor/three.module.js',
  'vendor/three.core.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon-32.png',
  'icons/favicon-16.png'
];

self.addEventListener('install', e => {
  /* cache:'reload' bypasses the HTTP cache (GitHub Pages serves max-age
     600): a default-mode addAll after back-to-back deploys can install the
     NEW cache name filled with STALE modules, and cache-first serving would
     pin that mixed set until the next deploy. */
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  /* Navigations fall back to the cached shell: a home-screen launch with a
     stale start_url (or any query string) must still boot offline. */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || caches.match('index.html'))
        .then(hit => hit || fetch(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      /* Cache only real successes: a cached 404 (a music track not yet
         dropped in) would make the miss permanent even after the file
         arrives. Opaque or error responses pass through uncached. */
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
