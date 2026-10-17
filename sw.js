const CACHE_NAME = 'azkar-cache-v11';

// ============================================================
// ملفات التطبيق نفسه (نفس الدومين). لازم تتخزن كلها وقت التثبيت، وبنجيبها
// cache:'reload' عشان نتجاوز كاش المتصفح (GitHub Pages بيخلّي الملف ١٠ دقايق
// بالكاش، وهيك كنا ممكن نخزّن نسخة قديمة وكأنها الجديدة).
// ============================================================
const CORE_ASSETS = [
  './',
  './index.html',
  './tracker.html',
  './prayer-times.html',
  './counter.html',
  './qibla.html',
  './account.html',
  './support.html',
  './manifest.json',
  './auth.js',
  './info.js',
  './tracker.js',
  './icon.png',
  './icon-192.png'
];

// اختيارية: لو فشل واحد منها (مثلاً الملف مو موجود) ما بيوقف التثبيت
const OPTIONAL_ASSETS = [
  './privacy.html',
  './icon-maskable-512.png',
  // خارجية (CORS مسموح): خطوط + فايربيس
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Amiri+Quran&family=Reem+Kufi:wght@400;500;700&family=Tajawal:wght@300;400;500;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await Promise.all(OPTIONAL_ASSETS.map(url => cache.add(url).catch(() => {})));
  })());
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

// مفتاح التخزين بدون ?query و #hash: tracker.html?date=... هو نفس صفحة tracker.html
function cacheKey(request){
  const u = new URL(request.url);
  u.search = '';
  u.hash = '';
  return u.href;
}

// ملفات التطبيق (صفحات + سكربتات + ستايل + أيقونات): الشبكة أولاً (دايماً نسخة طازة،
// وبنتجاوز كاش المتصفح)، لكن لو الشبكة وقعت أو تأخرت أكتر من ٣ ثواني منرجع للمخزّن.
// الصفحة والسكربتات بيجوا دايماً من نفس المصدر، فما بيصير تعارض نسخ بينهم.
function networkFirst(event, timeoutMs){
  const request = event.request;
  const key = cacheKey(request);

  const networkPromise = fetch(request, { cache: 'no-cache' }).then(res => {
    if(res && res.ok){
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(key, copy));
    }
    return res;
  });
  // حتى لو رجعنا للمخزّن، خلّي التحميل يكمل بالخلفية ويحدّث النسخة
  event.waitUntil(networkPromise.catch(() => {}));

  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));

  return Promise.race([networkPromise, timeout]).catch(async () => {
    const cached = await caches.match(key);
    if(cached) return cached;
    if(request.mode === 'navigate'){
      const home = await caches.match('./index.html');
      if(home) return home;
    }
    return networkPromise; // ما في نسخة محفوظة: نستنى الشبكة لآخرها
  });
}

// خطوط جوجل: بنرجّع المخزّن فوراً وبنحدّثه بالخلفية
function staleWhileRevalidate(event){
  const corsReq = new Request(event.request.url, { mode: 'cors', credentials: 'omit' });
  return caches.open(CACHE_NAME).then(cache =>
    cache.match(corsReq).then(cached => {
      const net = fetch(corsReq).then(res => {
        if(res && res.ok) cache.put(corsReq, res.clone());
        return res;
      }).catch(() => cached);
      event.waitUntil(net.catch(() => {}));
      return cached || net;
    })
  );
}

// مكتبات فايربيس: الرابط فيه رقم النسخة (10.7.1) يعني ما بيتغيّر أبداً — المخزّن أولاً
function cacheFirst(event){
  const corsReq = new Request(event.request.url, { mode: 'cors', credentials: 'omit' });
  return caches.match(corsReq).then(cached => cached || fetch(corsReq).then(res => {
    if(res && res.ok){
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(corsReq, copy));
    }
    return res;
  }));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);

  if(url.origin === self.location.origin){
    const isIcon = /\/icon[^/]*\.png$/.test(url.pathname);
    const isApp = request.mode === 'navigate' ||
      ['script', 'style', 'manifest'].includes(request.destination) || isIcon;
    if(isApp){
      event.respondWith(networkFirst(event, 3000));
    }
    return; // باقي الملفات (صور الصفحات...) المتصفح بيتعامل معها لحاله
  }

  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if(url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')){
    event.respondWith(cacheFirst(event));
    return;
  }

  // أي شي تاني (Firestore، Aladhan، تسجيل الدخول...): ما منتدخل أبداً.
});
