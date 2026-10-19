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

importScripts('./js/manifest.js');

const SHELL_CACHE   = 'rt-shell';     // HTML, JS, CSS, manifest, icons
const RUNTIME_CACHE = 'rt-runtime';   // cross-origin stuff (fonts, CDN)

// Derive the revision page URLs directly from manifest.js, so adding a
// subject there is the ONLY edit needed to precache it offline. No more
// silent drift between manifest.js and this file.
const REVISION_URLS = (self.REVISIONS || []).map(r => './' + r.page);

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/manifest.js',
  './js/storage.js',
  './js/main.js',
  './js/revision.js',

  ...REVISION_URLS,

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
  './images/23_01_mountains-peaks.jpg',

  './manifest.webmanifest',
  './icons/favicon-96x96.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
/*

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
  './revision/23_mountains_peaks.html',
  './revision/24_bihar_rivers_system.html',

  */

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
        // cache: 'no-cache' forces revalidation so "network first" is
        // actually fresh (otherwise the HTTP cache can serve a stale copy).
        const fresh = await fetch(new Request(req, { cache: 'no-cache' }));
        if (okToCache(fresh)) {
          // Redirects produce a response whose URL differs from req.url.
          // cache.put(req, ...) throws in that case — cache under both keys.
          const put = async u => { try { await cache.put(u, fresh.clone()); } catch (_) {} };
          await put(req);
          if (fresh.url && fresh.url !== req.url) await put(fresh.url);
        }
        return fresh;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;

        // App-shell fallback ONLY for the app's own root navigation.
        // Revision pages load inside <iframe> (destination === 'iframe',
        // not 'document'), AND deep links to /revision/*.html land here too.
        // Falling back to index.html for those would render the ENTIRE APP
        // inside a small iframe — a very confusing failure. Offline is
        // honest; the shell reload at root is not.
        const appRootPath = new URL('./', self.location).pathname;
        const indexPath   = new URL('./index.html', self.location).pathname;
        if (url.pathname === appRootPath || url.pathname === indexPath) {
          return (await cache.match('./index.html')) || offline();
        }
        return offline();
      }
    })());
    return;
  }

  /* 2. SAME-ORIGIN JS / CSS — stale-while-revalidate -------------------- */
  if (sameOrigin && /\.(?:js|css)$/i.test(url.pathname)) {
    const refresh = fetch(new Request(req, { cache: 'no-cache' }))
      .then(async res => {
        if (okToCache(res)) {
          // AWAIT the put inside the promise chain — previously the chain
          // resolved before cache.put finished, so a fast SW kill could
          // drop the update entirely.
          try {
            const c = await caches.open(SHELL_CACHE);
            await c.put(req, res.clone());
          } catch (_) {}
        }
        return res;
      })
      .catch(() => null);
    event.waitUntil(refresh);

    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit   = await cache.match(req);
      if (hit) return hit;
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