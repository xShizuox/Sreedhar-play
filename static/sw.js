const CACHE_NAME = 'sreedhar-play-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/home',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/dock.js',
  '/static/manifest.json',
  '/static/images/pwa-icon-192.png',
  '/static/images/pwa-icon-512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate event: cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: Network-first with cache fallback for HTML, Cache-first for others
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For music and covers, try network but fallback to cache if available
  if (url.pathname.startsWith('/static/music/') || url.pathname.startsWith('/static/cover_art/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Default strategy: Cache-first, Network-fallback
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          // Only cache successful GET requests
          if (event.request.method === 'GET' && fetchRes.status === 200) {
             cache.put(event.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    })
  );
});
