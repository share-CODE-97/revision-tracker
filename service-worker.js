/* ============================================================================
 * service-worker.js — Offline caching for Revision Tracker
 * ----------------------------------------------------------------------------
 * STRATEGY: cache-first, with network fallback + opportunistic runtime cache.
 *
 * ── WHEN YOU ADD A NEW SUBJECT ─────────────────────────────────────────────
 *   1. Add its HTML path to PRECACHE_URLS below.
 *   2. Bump CACHE_VERSION (e.g. 'v1' → 'v2') so old caches are purged.
 *   3. Reload the page twice (once to install the new SW, once to activate).
 *
 * NOTE: Service workers only run over http://localhost or https://. They are
 * silently skipped when the app is opened via file:// — which is fine, the
 * app just won't be available offline in that case.
 * ==========================================================================*/

const CACHE_VERSION = 'revision-tracker-v1';
const CACHE_NAME    = CACHE_VERSION;

/* ---------------------------------------------------------------------------
 * Everything listed here is downloaded on first install and served from
 * cache forever after. Add every file the app needs to boot offline.
 * -------------------------------------------------------------------------*/
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/manifest.js',
  './js/storage.js',
  './js/main.js',
  './js/revision.js',
  './revision/maths.html',
  './revision/physics.html',
  './revision/history.html',
  './revision/table.html',
  './revision/cube.html',
  './revision/medival-history.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ==========================================================================
 * INSTALL — precache all app files, then take over immediately.
 * ==========================================================================*/
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Precache failed (some files may be missing):', err))
  );
});

/* ==========================================================================
 * ACTIVATE — drop old caches, then claim all open clients.
 * ==========================================================================*/
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ==========================================================================
 * FETCH — cache-first, fall back to network, opportunistically cache
 * successful GETs (this is how the Tailwind / Font Awesome / Google Fonts
 * CDN assets end up cached after the first online visit).
 * ==========================================================================*/
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests.
  if (req.method !== 'GET') return;

  // Never try to cache browser-extension or non-http(s) schemes.
  if (!req.url.startsWith('http')) return;

  event.respondWith((async () => {
    const cache  = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    if (cached) return cached;

    try {
      const fresh = await fetch(req);

      // Only cache "basic" (same-origin) or "cors" (properly CORS-enabled)
      // 200 responses. Opaque responses (status 0) can't be cached.
      if (fresh && fresh.status === 200 && fresh.type !== 'opaque') {
        cache.put(req, fresh.clone()).catch(() => { /* quota / opaque — ignore */ });
      }
      return fresh;
    } catch (err) {
      // Offline AND not cached.
      if (req.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});