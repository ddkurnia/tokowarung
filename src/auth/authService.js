// ============================================
// TokOnline — Auth Service
// Single source of truth untuk login, register, logout, role assignment.
// TIDAK melakukan modifikasi data finansial atau order.
// ============================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';

import { auth, db } from '../firebase/config.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';

import { ROLE, USER_STATUS, COLLECTION } from '../utils/constants.js';

// ----- Listeners untuk state auth changes (multiple subscribers) -----
const listeners = new Set();
let currentUser = null;
let currentUserProfile = null;
let unsubAuthState = null;

/**
 * Inisialisasi auth listener global. Dipanggil sekali dari main.js.
 */
export function initAuth() {
  if (unsubAuthState) return unsubAuthState;

  unsubAuthState = onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      currentUser = null;
      currentUserProfile = null;
      notifyListeners(null);
      return;
    }

    currentUser = firebaseUser;
    try {
      currentUserProfile = await fetchUserProfile(firebaseUser.uid);
    } catch (err) {
      console.error('[auth] Gagal fetch profile:', err);
      currentUserProfile = null;
    }
    notifyListeners({ user: currentUser, profile: currentUserProfile });
  });

  return unsubAuthState;
}

function notifyListeners(payload) {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch (err) {
      console.error('[auth] listener error:', err);
    }
  }
}

/**
 * Subscribe ke auth state changes.
 * @param {(payload: {user, profile} | null) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onAuthChange(fn) {
  listeners.add(fn);
  // Immediately notify with current state if available
  if (currentUser) {
    fn({ user: currentUser, profile: currentUserProfile });
  }
  return () => listeners.delete(fn);
}

/**
 * Get current user synchronously (utk guard di router).
 */
export function getCurrentUser() {
  return currentUser ? { user: currentUser, profile: currentUserProfile } : null;
}

/**
 * Fetch profile user dari Firestore (collection: users).
 */
export async function fetchUserProfile(uid) {
  if (!uid) return null;
  const ref = doc(db, COLLECTION.USERS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Register akun baru dengan role.
 * Role default BUYER. Untuk role lain (SELLER, COURIER) perlu flow verifikasi tambahan.
 * ADMIN/SUPER_ADMIN hanya bisa dibuat via Firebase Console / Cloud Function.
 *
 * @param {object} param
 * @param {string} param.email
 * @param {string} param.password
 * @param {string} param.displayName
 * @param {string} param.role - default BUYER
 * @param {string} param.phone - opsional
 */
export async function registerUser({ email, password, displayName, role = ROLE.BUYER, phone = '' }) {
  if (!email || !password) {
    throw new Error('Email dan password wajib diisi.');
  }
  if (password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }
  if (!Object.values(ROLE).includes(role)) {
    throw new Error('Role tidak valid.');
  }
  // Larang self-register sebagai ADMIN/SUPER_ADMIN
  if ([ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(role)) {
    throw new Error('Role admin tidak dapat diregistrasi dari client. Hubungi super admin.');
  }

  // 1. Create Firebase Auth user
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const fbUser = cred.user;

  // 2. Update displayName (Auth profile)
  if (displayName) {
    await updateProfile(fbUser, { displayName: displayName.trim() });
  }

  // 3. Create Firestore user document
  const userDocRef = doc(db, COLLECTION.USERS, fbUser.uid);
  const profile = {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: displayName?.trim() || '',
    phone: phone?.trim() || '',
    role,
    status: role === ROLE.BUYER ? USER_STATUS.ACTIVE : USER_STATUS.PENDING_VERIFICATION,
    photoURL: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Role-specific flags
    sellerId: null, // di-set saat seller disetujui
    courierId: null,
    lastLoginAt: serverTimestamp(),
  };
  await setDoc(userDocRef, profile, { merge: true });

  // 4. Jika SELLER: buat dokumen seller (pending verification)
  if (role === ROLE.SELLER) {
    await createSellerApplication(fbUser.uid, displayName, phone);
  }

  // 5. Jika COURIER: buat dokumen courier (pending verification)
  if (role === ROLE.COURIER) {
    await createCourierApplication(fbUser.uid, displayName, phone);
  }

  currentUser = fbUser;
  currentUserProfile = await fetchUserProfile(fbUser.uid);
  notifyListeners({ user: currentUser, profile: currentUserProfile });

  return { user: fbUser, profile: currentUserProfile };
}

/**
 * Buat dokumen seller dengan status PENDING.
 * Seller application akan di-review oleh admin.
 */
async function createSellerApplication(uid, displayName, phone) {
  const sellerRef = doc(db, COLLECTION.SELLERS, uid);
  await setDoc(sellerRef, {
    uid,
    ownerName: displayName || '',
    storeName: '', // diisi nanti
    phone: phone || '',
    email: '',
    address: '',
    location: null, // { lat, lng }
    businessType: '',
    identityNumber: '', // PERLU hati2 — disimpan tapi bukan dokumen asli
    bankAccount: null, // { bank, accountNumber, holderName } — disimpan via Cloud Function untuk keamanan
    documents: [], // URL Storage untuk dokumen pendukung
    verificationStatus: 'PENDING',
    violationLevel: 'WARNING',
    violationScore: 0,
    rating: 0,
    totalRatings: 0,
    totalSales: 0,
    isOpen: false,
    serviceRadiusKm: 5,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Buat dokumen courier dengan status PENDING.
 */
async function createCourierApplication(uid, displayName, phone) {
  const courierRef = doc(db, COLLECTION.COURIERS, uid);
  await setDoc(courierRef, {
    uid,
    fullName: displayName || '',
    phone: phone || '',
    email: '',
    vehicleType: '', // MOTOR, MOBIL, BICYCLE
    vehiclePlate: '',
    identityNumber: '',
    licenseUrl: '',
    status: 'PENDING_VERIFICATION',
    isOnline: false,
    currentLocation: null,
    currentLoad: 0,
    maxConcurrentOrders: 1, // MVP: 1 order per courier
    rating: 0,
    totalRatings: 0,
    totalDeliveries: 0,
    zoneId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Login dengan email + password.
 */
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  currentUser = cred.user;
  currentUserProfile = await fetchUserProfile(cred.user.uid);

  // Update lastLoginAt
  try {
    await setDoc(doc(db, COLLECTION.USERS, cred.user.uid), {
      lastLoginAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('[auth] Gagal update lastLoginAt:', err);
  }

  notifyListeners({ user: currentUser, profile: currentUserProfile });
  return { user: currentUser, profile: currentUserProfile };
}

/**
 * Login dengan Google (utk BUYER cepat). Role lain harus link email/password.
 */
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  currentUser = cred.user;

  // Cek apakah user sudah ada profile, kalau belum buat sebagai BUYER
  currentUserProfile = await fetchUserProfile(cred.user.uid);
  if (!currentUserProfile) {
    const profile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || '',
      phone: cred.user.phoneNumber || '',
      photoURL: cred.user.photoURL || '',
      role: ROLE.BUYER,
      status: USER_STATUS.ACTIVE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    await setDoc(doc(db, COLLECTION.USERS, cred.user.uid), profile, { merge: true });
    currentUserProfile = profile;
  }

  notifyListeners({ user: currentUser, profile: currentUserProfile });
  return { user: currentUser, profile: currentUserProfile };
}

/**
 * Logout user.
 */
export async function logout() {
  await signOut(auth);
  currentUser = null;
  currentUserProfile = null;
  notifyListeners(null);
}

/**
 * Kirim email reset password.
 */
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Cek apakah email sudah terdaftar.
 * Catatan: tidak ada API langsung dari client, gunakan fetchUserProfile sebagai fallback.
 */
export async function isEmailRegistered(uid) {
  const profile = await fetchUserProfile(uid);
  return !!profile;
}
