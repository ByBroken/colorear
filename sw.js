/* Service worker: guarda todo en caché para funcionar sin internet. */
const CACHE = 'colorear-v2';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: siempre devolver la app (index.html) desde caché, aunque no haya red.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html', { ignoreSearch: true })
        .then((r) => r || fetch(req))
        .catch(() => caches.match('./'))
    );
    // Actualizar en segundo plano
    e.waitUntil(
      fetch(new Request('index.html', { cache: 'no-cache' }))
        .then((r) => r && r.ok ? caches.open(CACHE).then((c) => c.put('index.html', r)) : null)
        .catch(() => {})
    );
    return;
  }

  // Resto: caché primero, luego red (y guardar copia).
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      });
    })
  );
});
