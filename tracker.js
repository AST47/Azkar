// ============================================================
// tracker.js — المكان المشترك لحالة المتابعة اليومية.
// كل الصفحات (الأذكار، المتابعة، العدّادة) بتقرأ وبتكتب من هون فقط:
//   • حد اليوم (الفجر) محسوب مرة وحدة ومحفوظ بمفتاح مشترك
//   • شكل حالة اليوم وقواعد الربط (التهليل = نصفين، الاستغفار = نصفين)
//   • حفظ محلي + مزامنة الحساب + حدث 'azkar-tracker-changed' لأي تغيير
// بيعتمد على auth.js (لازم يتحمّل قبله).
//
// ربط ذكر جديد: أي مفتاح مو من مفاتيح المتابعة الأساسية (subhanallah, t1,
// t2, t3, lahawla, tawheed_a/b, istighfar_a/b) بينحفظ تلقائياً بقسم
// azkarItems — يعني: حط نفس المفتاح بـ trackerKey بالعدّادة، وبحقل "ربط"
// بالذكر بصفحة الأذكار، وبيشتغل الربط بدون أي تعديل هون.
// ============================================================

const Tracker = (() => {
  const EVENT = 'azkar-tracker-changed';
  const FAJR_CACHE_KEY = 'pt_fajr_cache';

  // المركّب = نصفين. تعليم النصفين بيكمّل المركّب، وتعليم المركّب بيعلّم النصفين.
  const COMPOUND_PARTS = { t1: ['tawheed_a', 'tawheed_b'], t2: ['istighfar_a', 'istighfar_b'] };
  const COMPOUND_OF = { tawheed_a: 't1', tawheed_b: 't1', istighfar_a: 't2', istighfar_b: 't2' };

  function emit(){ document.dispatchEvent(new CustomEvent(EVENT)); }

  // ---------- مفاتيح الربط ----------
  // الأذكار اللي إلها مربع بصفحة المتابعة (القائمة الثابتة اللي بتظهر بخيارات الربط).
  const KEY_OPTIONS = [
    {id:'t3', label:'الصلاة على النبي'},
    {id:'subhanallah', label:'التسبيح'},
    {id:'lahawla', label:'الحوقلة'},
    {id:'tawheed_a', label:'التهليل — لا إله إلا أنت سبحانك'},
    {id:'tawheed_b', label:'التهليل — لا إله إلا الله وحده'},
    {id:'istighfar_a', label:'الاستغفار — أستغفر الله العظيم'},
    {id:'istighfar_b', label:'الاستغفار — سيد الاستغفار'}
  ];

  // تخمين الربط للأذكار القديمة اللي ما انحدد إلها ربط صريح (من العنوان والنص بعد
  // إزالة التشكيل). الأخص أولاً. النص الطويل (> ٢٠٠ حرف) بيعتمد على العنوان بس.
  const TEXT_RULES = [
    ['istighfar_b', ['سيد الاستغفار', 'اللهم انت ربي']],
    ['tawheed_a',   ['لا اله الا انت سبحانك']],
    ['tawheed_b',   ['لا اله الا الله وحده']],
    ['lahawla',     ['لا حول ولا قوه', 'حوقله']],
    ['istighfar_a', ['استغفر الله', 'استغفار']],
    ['subhanallah', ['سبحان الله العظيم', 'سبحان الله وبحمده', 'تسبيح']],
    ['t3',          ['اللهم صل', 'صل وسلم', 'صلي علي', 'صلاه علي النبي', 'الصلاه علي النبي', 'صلي الله عليه وسلم']]
  ];
  function normalizeArabic(t){
    return String(t || '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[،,.؛:!؟?]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // مفتاح المتابعة الأساسي المربوط بالذكر، أو null لو ما إله
  function linkKeyOf(item){
    if(item.trackerKey === 'none') return null;
    if(item.trackerKey) return item.trackerKey;
    const title = normalizeArabic(item.title);
    const text = normalizeArabic(item.text);
    const hay = text.length <= 200 ? (title + ' | ' + text) : title;
    const hit = TEXT_RULES.find(([, phrases]) => phrases.some(p => hay.includes(p)));
    return hit ? hit[0] : null;
  }
  // مفتاح الذكر الفعلي: المربوط، أو معرّف الذكر نفسه (كل ذكر إله مفتاح دايماً)
  function itemKey(item){ return linkKeyOf(item) || item.id; }

  // ---------- حد اليوم ----------
  function dayKey(d){
    return 'tracker-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function calendarStamp(d){
    d = d || new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // بصمة إعدادات الموقع/الحساب: لو تغيّرت، دقيقة الفجر المحفوظة ما بتعود صالحة
  function settingsSig(){
    return [
      localStorage.getItem('pt_city') || '',
      localStorage.getItem('pt_lat') || '',
      localStorage.getItem('pt_lon') || '',
      localStorage.getItem('pt_method') || '',
      localStorage.getItem('pt_tune') || ''
    ].join('|');
  }

  function readFajrCache(){
    try{
      const c = JSON.parse(localStorage.getItem(FAJR_CACHE_KEY) || 'null');
      if(c && typeof c.min === 'number' && c.sig === settingsSig()) return c;
    }catch(e){}
    return null;
  }

  // دقيقة الفجر (من منتصف الليل). قبل ما نعرفها: ٣:٠٠ صباحاً.
  function boundaryMinutes(){
    const c = readFajrCache();
    return c ? c.min : 180;
  }

  function todayDate(){
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const d = new Date(now);
    if(nowMin < boundaryMinutes()) d.setDate(d.getDate() - 1);
    return d;
  }
  function todayKey(){ return dayKey(todayDate()); }

  let fetching = false;
  let waiting = [];
  function flush(){
    const cbs = waiting; waiting = []; fetching = false;
    cbs.forEach(cb => { try{ cb(); }catch(e){ console.warn(e); } });
  }

  function fetchFajr(geolocate, done){
    const method = Number(localStorage.getItem('pt_method')) || 13;
    let tune = [0,0,0,0,0,0,0,0,0];
    try{
      const t = JSON.parse(localStorage.getItem('pt_tune') || '{}');
      tune = [0, t.Fajr||0, t.Sunrise||0, t.Dhuhr||0, t.Asr||0, t.Maghrib||0, 0, t.Isha||0, 0];
    }catch(e){}
    const tuneStr = encodeURIComponent(tune.join(','));

    function request(url){
      fetch(url).then(r => r.json()).then(d => {
        if(d.code === 200){
          const [h, m] = d.data.timings.Fajr.split(' ')[0].split(':').map(Number);
          done(h * 60 + m);
        }else done(null);
      }).catch(() => done(null));
    }
    function byCoords(lat, lon){
      request(`https://api.aladhan.com/v1/timings/${Math.floor(Date.now()/1000)}?latitude=${lat}&longitude=${lon}&method=${method}&tune=${tuneStr}`);
    }

    const city = localStorage.getItem('pt_city');
    const lat = localStorage.getItem('pt_lat');
    const lon = localStorage.getItem('pt_lon');
    if(city){
      request(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=&method=${method}&tune=${tuneStr}`);
    }else if(lat && lon){
      byCoords(lat, lon);
    }else if(geolocate && navigator.geolocation){
      navigator.geolocation.getCurrentPosition(pos => {
        localStorage.setItem('pt_lat', pos.coords.latitude);
        localStorage.setItem('pt_lon', pos.coords.longitude);
        byCoords(pos.coords.latitude, pos.coords.longitude);
      }, () => done(null), { timeout: 8000 });
    }else{
      done(null);
    }
  }

  // بتجيب دقيقة الفجر وبتحفظها مرة باليوم لكل الصفحات. لو تغيّر "يوم المتابعة"
  // بسببها، بتطلق الحدث مشان الصفحات تعيد القراءة.
  // opts.geolocate: السماح بطلب GPS (فقط من المتابعة والعدّادة، مو من الرئيسية).
  function refreshBoundary(cb, opts){
    const geolocate = !!(opts && opts.geolocate);
    const c = readFajrCache();
    if(c && c.day === calendarStamp()){ if(cb) cb(); return; }
    if(cb) waiting.push(cb);
    if(fetching) return;
    fetching = true;
    const before = todayKey();
    fetchFajr(geolocate, min => {
      if(min != null){
        try{
          localStorage.setItem(FAJR_CACHE_KEY, JSON.stringify({ min, day: calendarStamp(), sig: settingsSig() }));
        }catch(e){}
      }
      const changed = todayKey() !== before;
      flush();
      if(changed) emit();
    });
  }

  // ---------- قراءة وكتابة ----------
  function normalize(s){ return normalizeDayState(s); } // من auth.js

  function read(key){
    key = key || todayKey();
    let parsed = null;
    try{
      const raw = localStorage.getItem(key);
      if(raw) parsed = JSON.parse(raw);
    }catch(e){}
    return normalize(parsed);
  }

  function write(key, state){
    key = key || todayKey();
    localStorage.setItem(key, JSON.stringify(state));
    if(typeof syncDayToCloud === 'function' && typeof localTrackerKeyToDayId === 'function'){
      syncDayToCloud(localTrackerKeyToDayId(key), state);
    }
    emit();
    return state;
  }

  const isBuiltin = id => DAY_SCHEMA.azkarTimes.includes(id);

  function isDoneIn(state, id){
    if(isBuiltin(id)) return !!state.azkarTimes[id];
    return !!(state.azkarItems && state.azkarItems[id]);
  }
  function isDone(id, key){ return isDoneIn(read(key), id); }

  // تطبيق تعليم على كائن حالة (بدون كتابة) — القواعد كلها هون
  function apply(state, id, value){
    value = !!value;
    if(isBuiltin(id)){
      state.azkarTimes[id] = value;
      if(COMPOUND_PARTS[id]){
        COMPOUND_PARTS[id].forEach(p => { state.azkarTimes[p] = value; });
      }else if(COMPOUND_OF[id]){
        const comp = COMPOUND_OF[id];
        state.azkarTimes[comp] = COMPOUND_PARTS[comp].every(p => !!state.azkarTimes[p]);
      }
    }else{
      state.azkarItems = state.azkarItems || {};
      state.azkarItems[id] = value;
    }
    return state;
  }

  // قراءة ← تعديل ← كتابة (مرة وحدة)
  function update(fn, key){
    key = key || todayKey();
    const s = read(key);
    fn(s);
    return write(key, s);
  }

  function setDone(id, value, key){
    return update(s => apply(s, id, value), key);
  }

  function toggle(section, id, key){
    return update(s => {
      if(section === 'azkarTimes') apply(s, id, !s.azkarTimes[id]);
      else s[section][id] = !s[section][id];
    }, key);
  }

  function reset(key){
    key = key || todayKey();
    localStorage.removeItem(key);
    return write(key, normalize({}));
  }

  function onChange(fn){ document.addEventListener(EVENT, fn); }

  // ---------- مصادر التغيير الخارجية ----------
  // يوم وصل من جهاز تاني (auth.js)
  document.addEventListener('azkar-days-changed', emit);
  // تغيّرت إعدادات الموقع/الطريقة (من جهاز تاني): احسب حد اليوم من جديد
  document.addEventListener('azkar-settings-changed', () => refreshBoundary(null));
  // تغيير من تبويب/نافذة تانية بنفس الجهاز
  window.addEventListener('storage', e => {
    if(e.key && (e.key.startsWith('tracker-') || e.key === FAJR_CACHE_KEY)) emit();
  });

  return {
    dayKey, todayKey, todayDate, boundaryMinutes, refreshBoundary,
    read, write, update, reset, normalize,
    isDone, isDoneIn, setDone, toggle, apply, onChange,
    COMPOUND_PARTS, COMPOUND_OF, KEY_OPTIONS, linkKeyOf, itemKey, normalizeArabic
  };
})();
