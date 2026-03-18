const CACHE_NAME = 'impostor-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/client.js',
  '/assets/logopng.png',
  '/assets/avatars/cat.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Instalar el Service Worker y guardar en caché inicial
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Interceptar peticiones para servir desde caché si es posible
self.addEventListener('fetch', (event) => {
  // Ignorar /api o conexiones a socket.io
  if (event.request.url.includes('/api/') || event.request.url.includes('socket.io')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Retorna el recurso de la caché si existe, sino lo busca en la red
      return response || fetch(event.request);
    })
  );
});

// Limpiar cachés antiguas al actualizar a una nueva versión
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
