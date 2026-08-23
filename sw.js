const CACHE_NAME = 'azkar-cache-v1';

const ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&family=Tajawal:wght@300;400;500;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// نخزّن بس ملفات الصفحة الأساسية (الخطوط ومكتبة Firebase وملف الصفحة نفسه)
// وما بنلمس طلبات Firestore الحقيقية حتى ما نأثر على المزامنة اللحظية
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;

  const url = event.request.url;
  const isKnownAsset = ASSETS.some(asset => url.includes(asset.replace('./', '')));
  if(!isKnownAsset) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
