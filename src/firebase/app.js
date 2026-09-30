// ============================================
// TokoWarung — Firebase App Singleton (Idempotent)
// Inisialisasi Firebase App secara aman, anti-double-init (utk Vite HMR).
// ============================================

import { initializeApp as fbInitializeApp, getApps, getApp } from 'firebase/app';

let _app = null;
let _initFrom = null;
let _configStatus = 'unknown'; // 'ok' | 'missing-env' | 'partial'

/**
 * Inisialisasi Firebase App. Aman dipanggil berkali-kali.
 * @param {object} config — firebase config object dari env vars
 * @returns {import('firebase/app').FirebaseApp}
 */
export function initializeApp(config) {
  // Sudah diinit di session ini
  if (_app) return _app;

  // Sudah ada instance Firebase lain (misal HMR)
  if (getApps().length > 0) {
    _app = getApp();
    _initFrom = 'existing';
    _configStatus = 'ok';
    return _app;
  }

  // Detect missing config
  const hasApiKey = config?.apiKey && typeof config.apiKey === 'string' && config.apiKey.length > 10;
  const hasProjectId = config?.projectId && typeof config.projectId === 'string' && config.projectId.length > 0;
  const hasAppId = config?.appId && typeof config.appId === 'string' && config.appId.length > 0;

  if (!hasApiKey || !hasProjectId || !hasAppId) {
    // TETAP init dengan placeholder agar service tidak crash saat import,
    // tapi semua auth/firestore calls akan fail dengan error yang jelas.
    _configStatus = !hasApiKey ? 'missing-env' : 'partial';
    console.error(
      `[TokoWarung] Firebase belum dikonfigurasi dengan benar.\n` +
        `Status: ${_configStatus}\n` +
        `Missing:\n` +
        `  - VITE_FIREBASE_API_KEY: ${hasApiKey ? '✓' : '✗ MISSING'}\n` +
        `  - VITE_FIREBASE_PROJECT_ID: ${hasProjectId ? '✓' : '✗ MISSING'}\n` +
        `  - VITE_FIREBASE_APP_ID: ${hasAppId ? '✓' : '✗ MISSING'}\n\n` +
        `CARA FIX:\n` +
        `  1. Buka Vercel project → Settings → Environment Variables\n` +
        `  2. Tambahkan 6 variabel Firebase (lihat .env.example untuk values)\n` +
        `  3. Redeploy project (Deployments → ⋮ → Redeploy)\n` +
        `  4. Tunggu 1-2 menit, refresh halaman\n\n` +
        `Lokal dev: salin .env.example menjadi .env, isi nilai Firebase.`
    );
    const safeConfig = {
      apiKey: hasApiKey ? config.apiKey : 'MISSING-' + Date.now(),
      authDomain: hasProjectId ? config.authDomain : 'missing.firebaseapp.com',
      projectId: hasProjectId ? config.projectId : 'missing-project',
      appId: hasAppId ? config.appId : '1:0:web:missing',
    };
    _app = fbInitializeApp(safeConfig);
    _initFrom = 'new-missing-config';
    return _app;
  }

  // Config valid — init normal
  _app = fbInitializeApp(config);
  _initFrom = 'new';
  _configStatus = 'ok';
  return _app;
}

/**
 * Cek apakah Firebase sudah diinit & terkonfigurasi dengan benar.
 * Return true jika env vars semua terisi & API key valid (length > 10).
 */
export function isFirebaseConfigured() {
  return _configStatus === 'ok';
}

/**
 * Cek status konfigurasi Firebase (utk debugging & error UI).
 */
export function getFirebaseConfigStatus() {
  return {
    initialized: !!_app,
    initFrom: _initFrom,
    appName: _app?.name,
    status: _configStatus,
  };
}

/**
 * @deprecated Use getFirebaseConfigStatus() instead.
 */
export function checkInitialized() {
  return getFirebaseConfigStatus();
}
