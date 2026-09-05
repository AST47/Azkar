const CACHE_NAME = 'azkar-cache-v3';

// ملفات ثابتة نادراً ما تتغير: نخزّنها ونحدّثها بالخلفية (stale-while-revalidate)
const STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Amiri+Quran&family=Reem+Kufi:wght@400;500;700&family=Tajawal:wght@300;400;500;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
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

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // 1) تصفح الصفحة نفسها (index.html): network-first، ونرجع للنسخة
  // المخزنة فقط لو ما في نت. هيك أي تحديث نرفعه يظهر فوراً.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 2) الملفات الثابتة المعروفة بس (خطوط + مكتبة Firebase): cache-first
  if (STATIC_ASSETS.includes(url)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request)
          .then(res => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // 3) أي شي تاني (وبالأخص طلبات Firestore الحقيقية): ما نتدخل إطلاقاً،
  // نخلي المتصفح يتعامل معها بشكل طبيعي بدون أي respondWith.
});
