// ============================================
// TokoWarung — Firebase Initialization (CLIENT SDK)
// ============================================
// ⚠️  PENTING:
// - Semua kredensial berasal dari environment variables (import.meta.env).
// - JANGAN PERNAH hardcode API key, project id, atau secret apa pun di file ini.
// - Kredensial client SDK Firebase bersifat public (aman di-expose ke browser)
//   TAPI keamanan sesungguhnya ada di Firestore Security Rules, BUKAN di sini.
//   Lihat: firestore.rules dan storage.rules
// ============================================

import { initializeApp, checkInitialized } from './app.js';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// 1. Validasi environment variables ada — fail fast kalau belum dikonfigurasi
const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = REQUIRED_ENV.filter((k) => !import.meta.env[k]);
if (missing.length > 0) {
  // Jangan throw di production build (akan crash Vite). Cukup console.error yang jelas.
  console.error(
    `[TokoWarung] Firebase belum dikonfigurasi. Missing env: ${missing.join(', ')}.\n` +
      `Salin .env.example menjadi .env dan isi nilai dari Firebase Console.\n` +
      `Lihat README.md bagian "Setup Firebase".`
  );
}

// 2. Firebase config object — fully env-driven
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// 3. Initialize app (idempotent — aman dipanggil berkali-kali)
const app = initializeApp(firebaseConfig);

// 4. Export singleton services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Debug flag — nonaktif di production
export const DEBUG_FIREBASE = import.meta.env.DEV && import.meta.env.VITE_DEBUG_FIREBASE === 'true';
if (DEBUG_FIREBASE) {
  console.debug('[TokoWarung] Firebase initialized for project:', firebaseConfig.projectId);
}

export { checkInitialized };
