/* Service worker de Colorear: guarda todo en caché para funcionar sin internet
   y recibe imágenes compartidas desde otras apps (Web Share Target). */
const CACHE = 'colorear-v72';
// fetch con tiempo límite: si la red no contesta pronto se usa la copia guardada
const conTiempo = (req, ms = 5000) => new Promise((ok, mal) => { const t = setTimeout(() => mal(new Error('timeout')), ms); fetch(req).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); mal(e); }); });
const CACHE_COMPARTIDO = 'colorear-compartido';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'privacidad.html',
  'i18n/es.js',
  'i18n/en.js',
  'i18n/pt-BR.js',
  'i18n/fr.js',
  'templates-data.js',
  'stamps-data.js',
  'pbn-data.js',
  'il-data.js',
  'fonts/GreatVibes-Regular.woff2',
  'fonts/Allura-Regular.woff2',
  'fonts/DancingScript.woff2',
  'navidad-data.js',
  'cozy-data.js',
  'icon-48.png',
  'icon-72.png',
  'icon-96.png',
  'icon-128.png',
  'icon-144.png',
  'icon-192.png',
  'icon-256.png',
  'icon-384.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon.ico',
  'favicon-32.png',
  'logo-badge-96.png',
  'logo-badge-192.png',
  'pdfjs/pdf.min.mjs',
  'pdfjs/pdf.worker.min.mjs'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      // v68: activar enseguida también cuando hay una versión anterior. Todo sale de la caché de esta versión
      // (completa y del mismo momento), así que la app abre sin esperar a la red. La página recarga como mucho una vez.
      .then(() => self.skipWaiting())
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
      e.respondWith(conTiempo(req).catch(() => caches.match('privacidad.html')));
      return;
    }
    e.respondWith(
      caches.match('index.html', { ignoreSearch: true })
        .then((r) => r || conTiempo(req, 8000))
        .catch(() => caches.match('./'))
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
