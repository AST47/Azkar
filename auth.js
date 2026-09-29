// ============================================================
// auth.js — وحدة مشتركة: تسجيل الدخول، هوية المستخدم، نمط التعديل،
// ومزامنة التراكر بين localStorage و Firestore.
// تُضاف لكل صفحة بعد سكربتات Firebase (app/auth/firestore) وبعد
// firebase.initializeApp(firebaseConfig)، وقبل أي كود يعتمد عليها.
// ============================================================

const ADMIN_EMAIL = "salehzuh@gmail.com";

const auth = firebase.auth();
const db = firebase.firestore();

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

// ---------- دوال الرفع/الدمج (تُستكمل بالخطوة الجاية) ----------
async function uploadLocalSettings(uid) { /* TODO: الخطوة الجاية */ }
async function uploadLocalHistory(uid) { /* TODO: الخطوة الجاية */ }
async function mergeLocalHistoryIntoAccount(uid) { /* TODO: الخطوة الجاية */ }
async function flushPendingWrites() { /* TODO: الخطوة الجاية */ }
