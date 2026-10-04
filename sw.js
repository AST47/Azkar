const CACHE_NAME = 'azkar-cache-v7';

// نخزن كل صفحات التطبيق فوراً وقت التثبيت، عشان التطبيقات المثبّتة على
// الشاشة الرئيسية (خصوصاً آيفون) يكون عندها نسخة محفوظة من أول لحظة،
// لأنه تخزين هيك تطبيقات بيكون منفصل عن تخزين المتصفح العادي
const PAGE_ASSETS = [
  './',
  './index.html',
  './tracker.html',
  './prayer-times.html',
  './counter.html',
  './qibla.html',
  './account.html',
  './support.html',
  './manifest.json'
];

// ملفات ثابتة: نخزّنها ونحدّثها بالخلفية (stale-while-revalidate).
// auth.js هون بالقصد رغم إنه بيتغيّر بين فترة وفترة — هو ملف أساسي
// كل صفحة معتمدة عليه (db/auth/currentUser)، فلازم يكون محفوظ أوفلاين
// دايماً، وستريتيجية stale-while-revalidate بتحدّثه أول ما في نت.
const STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Amiri+Quran&family=Reem+Kufi:wght@400;500;700&family=Tajawal:wght@300;400;500;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  './auth.js',
  'icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // الملفات الأساسية للصفحات — لازم تتخزن، هاي أساس عمل التطبيق أوفلاين
      caches.open(CACHE_NAME).then(cache => cache.addAll(PAGE_ASSETS)),
      // ملفات خارجية (خطوط + فايربيس + auth.js) — بأفضل جهد، فشلها ما لازم يوقف تخزين الصفحة
      caches.open(CACHE_NAME).then(cache =>
        Promise.all(STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => {})
        ))
      )
    ])
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

  // 1) تصفح أي صفحة (index.html، tracker.html، إلخ): network-first، ونرجع
  // للنسخة المخزنة فقط لو ما في نت. هيك أي تحديث نرفعه يظهر فوراً.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // 2) الملفات الثابتة المعروفة بس (خطوط + مكتبة Firebase + auth.js): cache-first
  if (STATIC_ASSETS.includes(url) || url.endsWith('/auth.js')) {
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
