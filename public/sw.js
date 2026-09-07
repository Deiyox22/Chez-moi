/* Chez Moi service worker: app shell offline, API always live. */

const VERSION = 'chez-moi-v2';
// Le runtime WebAssembly et le modèle de segmentation pèsent 19 Mo et ne
// changent jamais : ils vivent dans un cache à part, que la mise à jour du
// shell ne vide pas. Ils ne sont pas préchargés — seulement gardés au premier
// détourage, pour que le suivant marche même hors ligne.
const CACHE_LOURD = 'chez-moi-lourd-v1';
const estLourd = (chemin) => chemin.startsWith('/vendor/') || chemin.startsWith('/modeles/');

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/app.js',
  '/js/lib/ui.js',
  '/js/lib/db.js',
  '/js/lib/api.js',
  '/js/lib/images.js',
  '/js/lib/plan.js',
  '/js/lib/moodboard.js',
  '/js/lib/dimensions.js',
  '/js/lib/montage.js',
  '/js/lib/montage-editeur.js',
  '/js/lib/homographie.js',
  '/js/lib/segmentation.js',
  '/js/views/home.js',
  '/js/views/furniture.js',
  '/js/views/rooms.js',
  '/js/views/designs.js',
  '/js/views/stores.js',
  '/js/views/settings.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION && key !== CACHE_LOURD).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The API needs live data and a real error when offline.
  if (url.pathname.startsWith('/api/')) return;

  // Assets immuables : le cache fait foi, sans jamais revalider 19 Mo.
  if (estLourd(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_LOURD).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
