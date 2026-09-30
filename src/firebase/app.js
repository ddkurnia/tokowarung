// ============================================
// TokOnline — Firebase App Singleton (Idempotent)
// Inisialisasi Firebase App secara aman, anti-double-init (utk Vite HMR).
// ============================================

import { initializeApp as fbInitializeApp, getApps, getApp } from 'firebase/app';

let _app = null;
let _initFrom = null;

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
    return _app;
  }

  // Init baru. Kalau config masih kosong (env belum diisi),
  // kita tetap init dengan placeholder — service calls akan throw error jelas.
  const safeConfig = config && config.apiKey ? config : { apiKey: 'MISSING', authDomain: 'MISSING', projectId: 'MISSING' };

  _app = fbInitializeApp(safeConfig);
  _initFrom = 'new';
  return _app;
}

/**
 * Cek apakah Firebase sudah diinit — utk debugging.
 */
export function checkInitialized() {
  return { initialized: !!_app, from: _initFrom, appName: _app?.name };
}
