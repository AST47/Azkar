const CACHE_NAME = 'azkar-cache-v2';

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

// index.html: نتحقق من النت أولاً (network-first) عشان أي تحديث يظهر فوراً،
// ونستخدم النسخة المخزنة فقط لو ما في نت. باقي الملفات (خطوط ومكتبة Firebase)
// نادراً ما تتغير فبنخليها cache-first زي ما كانت.
const NETWORK_FIRST = ['./', './index.html'];

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;

  const url = event.request.url;
  const isNetworkFirst = NETWORK_FIRST.some(a => url.endsWith(a.replace('./', '')) || url.endsWith('/'));

  if(isNetworkFirst){
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

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
