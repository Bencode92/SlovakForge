// SlovakForge Service Worker - Offline cache
const CACHE_NAME = 'slovakforge-v3';
const ASSETS = [
  '/SlovakForge/',
  '/SlovakForge/index.html',
  '/SlovakForge/api.js',
  '/SlovakForge/app.js',
  '/SlovakForge/manifest.json'
];

// Install: cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // API calls (Claude proxy, GitHub) -> always network
  if (url.hostname !== location.hostname) {
    return; // let browser handle normally
  }
  
  // App assets -> cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
