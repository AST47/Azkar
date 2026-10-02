// ============================================================
// auth.js — وحدة مشتركة: تسجيل الدخول، هوية المستخدم، نمط التعديل،
// ومزامنة التراكر بين localStorage و Firestore.
// تُضاف لكل صفحة بعد سكربتات Firebase (app/auth/firestore) وبعد
// firebase.initializeApp(firebaseConfig)، وقبل أي كود يعتمد عليها.
// ============================================================

const ADMIN_EMAIL = "salehzuh@gmail.com";

const auth = firebase.auth();
const db = firebase.firestore();

// تخزين أوفلاين لفايرستور: الكتابات وقت ما في اتصال بتنحفظ محلياً
// وبترفع تلقائياً أول ما يرجع الاتصال — هاد أساس المزامنة الحيّة.
db.settings({ experimentalAutoDetectLongPolling: true, useFetchStreams: false });
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  console.warn('تعذّر تفعيل التخزين المحلي لفايرستور:', err.code);
});

// ---------- حالة المستخدم (متاحة لكل صفحة) ----------
let currentUser = null;   // كائن Firebase User أو null (ضيف)
let isAdmin = false;      // محسوبة من currentUser.email
let editMode = false;     // نمط التعديل (أدمن بس، مفتاح يدوي)

const AZKAR_AUTH_READY = new Promise(resolve => {
  auth.onAuthStateChanged(async user => {
    currentUser = user;
    isAdmin = !!(user && user.email === ADMIN_EMAIL);
    if (isAdmin) {
      editMode = localStorage.getItem('editMode') === '1';
    } else {
      editMode = false;
      localStorage.removeItem('editMode');
    }
    document.dispatchEvent(new CustomEvent('azkar-auth-changed', {
      detail: { user, isAdmin, editMode }
    }));
    resolve();
  });
});

function toggleEditMode(on) {
  if (!isAdmin) return;
  editMode = (on !== undefined) ? !!on : !editMode;
  localStorage.setItem('editMode', editMode ? '1' : '0');
  document.dispatchEvent(new CustomEvent('azkar-auth-changed', {
    detail: { user: currentUser, isAdmin, editMode }
  }));
}

// ---------- تسجيل الدخول ----------
const googleProvider = new firebase.auth.GoogleAuthProvider();

function signInWithGoogle() {
  return auth.signInWithPopup(googleProvider).then(cred => onFirstSignIn(cred.user));
}

function signUpWithEmail(email, password) {
  return auth.createUserWithEmailAndPassword(email, password).then(cred => onFirstSignIn(cred.user));
}

function signInWithEmail(email, password) {
  return auth.signInWithEmailAndPassword(email, password).then(cred => onFirstSignIn(cred.user));
}

// عند أول دخول: نتحقق هل في بيانات بالحساب أصلاً، إذا لأ نرفع
// بيانات الجهاز المحلية (تراكر + إعدادات) كما هي (merge لمرة وحدة).
async function onFirstSignIn(user) {
  if (!user || user.email === ADMIN_EMAIL) return;
  const settingsRef = db.collection('users').doc(user.uid);
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    await uploadLocalSettings(user.uid);
    await uploadLocalHistory(user.uid); // استثناء لمرة وحدة، يشمل تاريخ أقدم من ٣ أيام
  } else {
    await mergeLocalHistoryIntoAccount(user.uid); // دمج "الصح يفوز" حصراً لهاي المرة
  }
}

// ---------- تسجيل الخروج (مع تنظيف الجهاز) ----------
async function signOutAndClear() {
  await flushPendingWrites();
  auth.signOut().then(() => {
    // تنظيف بيانات المستخدم من الجهاز (تراكر + إعدادات + نمط التعديل)
    // مشان ما تنتقل لمستخدم تاني على نفس الجهاز
    Object.keys(localStorage)
      .filter(k => k.startsWith('tracker-') || k.startsWith('pt_') || k === 'editMode')
      .forEach(k => localStorage.removeItem(k));
  });
}

// ---------- قراءة أيام التراكر المحلية ----------
// المفتاح المحلي الحالي: tracker-YYYY-M-D (بدون أصفار بادئة).
// بنحوّله هون لصيغة YYYY-MM-DD (بأصفار بادئة) مشان يصير قابل للمقارنة
// نصياً بقواعد Firestore (شرط الـ٣ أيام).
function getAllLocalTrackerDays(){
  const days = {};
  Object.keys(localStorage).forEach(key => {
    if(!key.startsWith('tracker-')) return;
    const parts = key.slice('tracker-'.length).split('-');
    if(parts.length !== 3) return;
    const [y, m, d] = parts;
    const dayId = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    try{
      const parsed = JSON.parse(localStorage.getItem(key));
      if(parsed) days[dayId] = parsed;
    }catch(e){ /* تجاهل مفتاح تالف */ }
  });
  return days;
}

// دمج "الصح يفوز": أي true من أي مصدر بيضل true بالنتيجة.
function mergeDayStatesTrueWins(cloudState, localState){
  const merged = {};
  ['quran','prayers','azkarCategories','azkarTimes'].forEach(section => {
    merged[section] = {};
    const a = (cloudState && cloudState[section]) || {};
    const b = (localState && localState[section]) || {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach(k => { merged[section][k] = !!a[k] || !!b[k]; });
  });
  return merged;
}

// يحوّل مفتاح محلي 'tracker-Y-M-D' لصيغة 'YYYY-MM-DD' (أصفار بادئة).
function localTrackerKeyToDayId(key){
  const parts = key.slice('tracker-'.length).split('-');
  if(parts.length !== 3) return null;
  const [y, m, d] = parts;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// مزامنة حيّة: بتترفع فوراً مع كل تغيير بالتراكر (من tracker.html أو
// counter.html). بفضل التخزين الأوفلاين فوق، لو ما في اتصال، فايرستور
// بيأجلها تلقائياً وبيرفعها أول ما يرجع الاتصال — بدون أي كود إضافي.
function syncDayToCloud(dayId, data){
  if(!currentUser || !dayId) return;
  db.collection('users').doc(currentUser.uid).collection('days').doc(dayId)
    .set(data, { merge: true })
    .catch(err => console.warn('تعذّرت مزامنة اليوم:', err.message));
}

// ---------- دوال الرفع/الدمج ----------

// رفع الإعدادات المحلية (مدينة، طريقة حساب، تصحيح يدوي، عرض الأوقات
// بالأذكار) لأول مرة. ما بتلمس GPS (pt_lat/pt_lon) ولا تبقى محلية بقصد.
async function uploadLocalSettings(uid){
  const settings = {
    city: localStorage.getItem('pt_city') || null,
    method: localStorage.getItem('pt_method') || null,
    tune: localStorage.getItem('pt_tune') || null,
    showPrayerTimes: localStorage.getItem('show_prayer_times') === '1'
  };
  await db.collection('users').doc(uid).set({ settings }, { merge: true });
}

// رفع كل أيام التراكر المحلية كما هي — استثناء لمرة وحدة بيشمل تاريخ
// أقدم من ٣ أيام (أول تسجيل فقط، قبل ما قواعد النافذة الزمنية تصير فعّالة).
async function uploadLocalHistory(uid){
  const localDays = getAllLocalTrackerDays();
  const col = db.collection('users').doc(uid).collection('days');
  const batch = db.batch();
  Object.entries(localDays).forEach(([dayId, data]) => {
    batch.set(col.doc(dayId), data);
  });
  if(Object.keys(localDays).length) await batch.commit();
}

// دمج تاريخ الجهاز المحلي مع تاريخ موجود أصلاً بالحساب — "الصح يفوز"
// لهاي المرة بس (أول ما يسجل دخول من جهاز فيه بيانات والحساب فيه بيانات).
async function mergeLocalHistoryIntoAccount(uid){
  const localDays = getAllLocalTrackerDays();
  const col = db.collection('users').doc(uid).collection('days');
  const entries = Object.entries(localDays);
  for(const [dayId, localData] of entries){
    const ref = col.doc(dayId);
    const snap = await ref.get();
    const merged = snap.exists
      ? mergeDayStatesTrueWins(snap.data(), localData)
      : localData;
    await ref.set(merged);
  }
}

// صمام أمان قبل تسجيل الخروج: برفع آخر حالة محلية (merge، بدون ما
// يلغي شي بالسحابة) حتى لو ما في مزامنة حيّة أثناء الاستخدام لسا.
// ملاحظة: هاي مش بديل عن مزامنة فورية مع كل تغيير — هاد موضوع منفصل.
async function flushPendingWrites(){
  if(!currentUser) return;
  const localDays = getAllLocalTrackerDays();
  const col = db.collection('users').doc(currentUser.uid).collection('days');
  const batch = db.batch();
  Object.entries(localDays).forEach(([dayId, data]) => {
    batch.set(col.doc(dayId), data, { merge: true });
  });
  try{
    if(Object.keys(localDays).length) await batch.commit();
  }catch(e){
    console.warn('تعذّر حفظ آخر التحديثات قبل الخروج:', e);
  }
}
