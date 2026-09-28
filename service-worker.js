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

const CACHE_VERSION = 'revision-tracker-v8';
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

  './revision/01_squares-cubes.html',
  './revision/02_table.html',
  './revision/03_magadha-dynasties.html',
  './revision/04_medival-history.html',
  './revision/05_akbar-campaigns.html',
  './revision/06_anglo-wars.html',
  './revision/07_foreign-crops.html',
  './revision/08_cropping-seasons.html',
  './revision/09_alloys-ores.html',
  './revision/10_india_minerals.html',
  './revision/11_indian-rivers.html',
  './revision/12_grasslands-world.html',  
  './revision/13_mountains-volcanoes.html',
  './revision/14_world-geography.html',  
  './revision/15_physical-geography.html',
  './revision/16_science-capsule.html',  
  './revision/17_international_organization.html',
  './revision/18_socio_religious_movement.html',  
  './revision/19_foreign_travellers.html',
  './revision/20_modern_india_1857_1947_overview.html',  
  './revision/21_viceroys.html',
  './revision/22_president_of_india.html', 


/* ABOVE THIS LINE IS PERFECT */




/* BELOW THIS LINE IS PERFECT */

  './images/10_01_india_minerals.jpg',
  './images/11_01_indian-rivers.jpg',
  './images/11_02_indian-rivers.jpg',
  './images/11_03_indian-rivers.jpg',
  './images/11_04_indian-rivers.jpg',
  './images/12_01_grasslands-world.jpg',
  './images/13_01_mountains-volcanoes.jpg',
  './images/13_02_mountains-volcanoes.jpg',
  './images/13_03_mountains-volcanoes.jpg',
  './images/14_01_world-geography.jpg',
  './images/14_02_world-geography.jpg',
  './images/14_03_world-geography.jpg',
  './images/14_04_world-geography.jpg',
  './images/15_01_physical-geography.jpg',
  './images/15_02_physical-geography.jpg',
  './images/15_03_physical-geography.jpg',
  './images/15_04_physical-geography.jpg',


  
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