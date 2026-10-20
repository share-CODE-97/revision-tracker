/* ============================================================================
 * service-worker.js — auto-updating offline cache (Phase 2: Safe Updates)
 * ==========================================================================*/

importScripts('./js/manifest.js');

const SHELL_CACHE   = 'rt-shell-v3';     // BUMPED
const RUNTIME_CACHE = 'rt-runtime-v3';   // BUMPED

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

  // Local Fonts (graceful 404 if user hasn't downloaded them yet)
  './assets/vendor/inter/Inter-Variable.woff2',
  './assets/vendor/fontawesome/css/all.min.css',

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

function okToCache(res) {
  if (!res) return false;
  if (res.type === 'opaque') return true;
  return res.ok;
}

function offline() {
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

/* ==========================================================================
 * INSTALL — NO skipWaiting() here. The new SW waits until the user clicks
 * "Reload" in the app, preventing interruptions during active revisions.
 * ==========================================================================*/
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(PRECACHE_URLS.map(async url => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        console.warn('[SW] precache miss:', url);
      }
    }));
  })());
});

/* ==========================================================================
 * ACTIVATE — Clean up old versions, but NEVER touch 'rt-data-*'
 * ==========================================================================*/
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old SHELL caches
          if (cacheName.startsWith('rt-shell-') && cacheName !== SHELL_CACHE) {
            return caches.delete(cacheName);
          }
          // Delete old RUNTIME caches
          if (cacheName.startsWith('rt-runtime-') && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ==========================================================================
 * MESSAGE — Listen for user confirming the update
 * ==========================================================================*/
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(new Request(req, { cache: 'no-cache' }));
        if (okToCache(fresh)) {
          const put = async u => { try { await cache.put(u, fresh.clone()); } catch (_) {} };
          await put(req);
          if (fresh.url && fresh.url !== req.url) await put(fresh.url);
        }
        return fresh;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
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

  if (sameOrigin && /\.(?:js|css)$/i.test(url.pathname)) {
    const refresh = fetch(new Request(req, { cache: 'no-cache' }))
      .then(async res => {
        if (okToCache(res)) {
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