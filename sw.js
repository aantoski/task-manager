// Serves the app from cache so it opens offline, and refreshes the cache in the
// background so the next launch picks up any changes you've pushed.
const CACHE = 'taskhelper-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const cache = caches.open(CACHE);
  const network = fetch(req).then(async res => {
    if (res.ok) (await cache).put(req, res.clone());
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  e.respondWith(
    cache.then(c => c.match(req, { ignoreSearch: true }))
      .then(cached => cached || network)
  );
});
