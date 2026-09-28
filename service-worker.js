/* ============================================================================
 * service-worker.js — auto-updating offline cache
 * ----------------------------------------------------------------------------
 *  • Page navigations        → NETWORK FIRST   (always fresh when online)
 *  • Same-origin .js / .css  → STALE-WHILE-REVALIDATE  (instant + self-updating)
 *  • Images / icons / CDN    → CACHE FIRST     (they rarely change)
 *
 *  • NOTHING is ever deleted by this file.
 *  • If you keep app data in Cache Storage, name that cache 'rt-data-…'
 *    (or anything not starting with 'rt-shell' / 'rt-runtime').
 * ==========================================================================*/

const SHELL_CACHE   = 'rt-shell';     // HTML, JS, CSS, manifest, icons
const RUNTIME_CACHE = 'rt-runtime';   // cross-origin stuff (fonts, CDN)

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

/* ---------- helpers ------------------------------------------------------ */

function okToCache(res) {
  if (!res) return false;
  if (res.type === 'opaque') return true;           // CDN without CORS
  return res.ok;                                    // 200-299
}

function offline() {
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

/* ==========================================================================
 * INSTALL — pre-cache every file, then activate immediately.
 * ==========================================================================*/
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(PRECACHE_URLS.map(async url => {
      try {
        // cache:'reload' bypasses HTTP cache so we really get the current file
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        console.warn('[SW] precache miss:', url);
      }
    }));
    await self.skipWaiting();
  })());
});

/* ==========================================================================
 * ACTIVATE — take over clients. We do NOT delete anything here.
 * ==========================================================================*/
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

/* ==========================================================================
 * FETCH
 * ==========================================================================*/
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* 1. PAGE NAVIGATION — network first ---------------------------------- */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(req);
        if (okToCache(fresh)) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return (await cache.match(req))
            || (await cache.match('./index.html'))
            || offline();
      }
    })());
    return;
  }

  /* 2. SAME-ORIGIN JS / CSS — stale-while-revalidate -------------------- */
  if (sameOrigin && /\.(?:js|css)$/i.test(url.pathname)) {
    // Kick off the refresh in parallel, keep SW alive via waitUntil
    const refresh = fetch(req).then(res => {
      if (okToCache(res)) {
        caches.open(SHELL_CACHE)
          .then(c => c.put(req, res.clone()))
          .catch(() => {});
      }
      return res;
    }).catch(() => null);
    event.waitUntil(refresh);

    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit   = await cache.match(req);
      if (hit) return hit;                 // instant, fresh copy lands in background
      const net = await refresh;
      return net || offline();
    })());
    return;
  }

  /* 3. EVERYTHING ELSE — cache first ------------------------------------ */
  const cacheName = sameOrigin ? SHELL_CACHE : RUNTIME_CACHE;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const hit   = await cache.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (okToCache(fresh)) cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch {
      return offline();
    }
  })());
});