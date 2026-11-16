/* Service worker de Colorear: guarda todo en caché para funcionar sin internet
   y recibe imágenes compartidas desde otras apps (Web Share Target). */
const CACHE = 'colorear-v67';
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
      // v67: activar siempre enseguida. La app guarda el dibujo y se recarga sola (antes esperaba a que
      // tocaran «Actualizar» y en Android seguía saliendo la versión vieja).
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

  // v67: la app y sus datos (html, js, json, manifest) van primero a la red, con la copia guardada si no hay internet.
  // Así una versión nueva sale en la próxima apertura. Imágenes, fuentes y pdf.js: caché primero.
  const app = req.mode === 'navigate' || /\.(html|js|mjs|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (app && !url.pathname.includes('/pdfjs/')) {
    const key = req.mode === 'navigate' && !url.pathname.endsWith('/privacidad.html') && !url.pathname.endsWith('/soporte.html') ? 'index.html' : req;
    e.respondWith((async () => {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
        const res = await fetch(req.mode === 'navigate' ? new Request(key === 'index.html' ? 'index.html' : req.url, { cache: 'no-cache', signal: ctl.signal }) : new Request(req, { cache: 'no-cache', signal: ctl.signal }));
        clearTimeout(t);
        if (res && res.ok && res.type === 'basic') { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(key, copia)); }
        return res;
      } catch (err) {
        const hit = await caches.match(key, { ignoreSearch: true }) || (req.mode === 'navigate' ? await caches.match('./') : null);
        if (hit) return hit;
        throw err;
      }
    })());
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
