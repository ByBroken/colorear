/* Service worker de Colorear: guarda todo en caché para funcionar sin internet
   y recibe imágenes compartidas desde otras apps (Web Share Target). */
const CACHE = 'colorear-v5';
const CACHE_COMPARTIDO = 'colorear-compartido';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'privacidad.html',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      // Primera instalación: activar enseguida. Si ya hay una versión anterior,
      // esperar a que la persona toque "Actualizar" (así no se pierde nada a medio dibujar).
      .then(() => { if (!self.registration.active) return self.skipWaiting(); })
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'actualizar') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE_COMPARTIDO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Imagen compartida a la app instalada (Android: Compartir → Colorear)
async function recibirCompartido(req) {
  try {
    const fd = await req.formData();
    const f = fd.getAll('imagen').find((x) => x && typeof x !== 'string');
    if (f) {
      const c = await caches.open(CACHE_COMPARTIDO);
      await c.put('compartido', new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }));
    }
  } catch (err) { /* sin imagen: la app avisará */ }
  return Response.redirect(new URL('./?compartido=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === 'POST' && url.pathname.endsWith('/compartir-destino')) {
    e.respondWith(recibirCompartido(req));
    return;
  }
  if (req.method !== 'GET') return;

  // Navegación: devolver la app (index.html) desde caché, aunque no haya red.
  if (req.mode === 'navigate') {
    if (url.pathname.endsWith('/privacidad.html')) {
      e.respondWith(fetch(req).catch(() => caches.match('privacidad.html')));
      return;
    }
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
