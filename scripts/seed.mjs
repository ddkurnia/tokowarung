// ============================================
// TokoWarung — Firestore Seed Script (ES Module)
// ============================================
// Inisialisasi data dasar: categories, settings, prohibited keywords.
//
// Cara pakai:
//   1. Pastikan sudah login firebase: npx firebase login
//   2. Jalankan: node scripts/seed.mjs
//
// Skrip ini membaca refresh token dari firebase-tools config,
// menukarnya dengan access token Google, lalu panggil Firestore REST API.
// Tidak perlu service account JSON.
// ============================================

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const firebaseToolsApi = require('firebase-tools/lib/api');

const PROJECT_ID = 'tokowarung-15b64';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ----- SEED DATA -----

const CATEGORIES = [
  { id: 'sembako', name: 'Sembako', icon: '🛒', sortOrder: 1 },
  { id: 'kuliner', name: 'Kuliner', icon: '🍲', sortOrder: 2 },
  { id: 'fashion', name: 'Fashion', icon: '👕', sortOrder: 3 },
  { id: 'elektronik', name: 'Elektronik', icon: '📱', sortOrder: 4 },
  { id: 'kecantikan', name: 'Kecantikan', icon: '💄', sortOrder: 5 },
  { id: 'rumah-tangga', name: 'Rumah Tangga', icon: '🏠', sortOrder: 6 },
  { id: 'jasa', name: 'Jasa', icon: '🛠️', sortOrder: 7 },
  { id: 'umkm', name: 'UMKM', icon: '🏪', sortOrder: 8 },
  { id: 'lainnya', name: 'Lainnya', icon: '📦', sortOrder: 99 },
];

const DEFAULT_SETTINGS = {
  platformCommissionPercent: 3,
  sellerFeePercent: 0,
  buyerServiceFeeFlat: 1000,
  courierFeePerKm: 2000,
  minimumWithdrawal: 50000,
  maximumCOD: 500000,
  deliveryRadiusKm: 10,
  orderTimeoutMinutes: 30,
  courierOfferTimeoutSeconds: 30,
  sellerReviewRequired: true,
  maintenanceMode: false,
  minimumSellerRating: 4.0,
  minimumCourierRating: 4.0,
};

const PROHIBITED_KEYWORDS = [
  'obat keras', 'psikotropika', 'narkoba', 'ganja', 'sabu', 'ekstasi',
  'senjata api', 'amunisi', 'bahan peledak', 'pisau lipat',
  'pornografi', 'konten dewasa', 'jasa dating',
  'uang palsu', 'tiket palsu', 'dokumen palsu',
];

// ============================================
// Get access token via firebase-tools refresh
// ============================================
async function getAccessToken() {
  // 1. Read refresh_token from firebase-tools config
  const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Belum login firebase. Run: npx firebase login');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('Tidak ada refresh_token di firebase config. Run: npx firebase login');
  }

  // 2. Get client_id & client_secret from firebase-tools
  // (these are public, hardcoded in firebase-tools module for CLI OAuth)
  const clientId = firebaseToolsApi.clientId();
  const clientSecret = firebaseToolsApi.clientSecret();

  // 3. Exchange refresh_token for access_token via Google OAuth
  console.log('🔄 Refreshing OAuth token...');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OAuth refresh failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ============================================
// Firestore REST API helpers
// ============================================
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

async function writeDocument(token, collection, docId, fieldsObj) {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}`;
  const body = toFirestoreFields(fieldsObj);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore write ${collection}/${docId} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('🚀 TokoWarung Firestore Seed');
  console.log(`   Project: ${PROJECT_ID}`);
  console.log('');

  const token = await getAccessToken();
  console.log('✓ Access token obtained.\n');

  // 1. Categories
  console.log('📂 Seeding categories...');
  for (const cat of CATEGORIES) {
    await writeDocument(token, 'categories', cat.id, {
      name: cat.name,
      icon: cat.icon,
      sortOrder: cat.sortOrder,
    });
    console.log(`  ✓ ${cat.icon} ${cat.name} (id: ${cat.id})`);
  }

  // 2. App settings
  console.log('\n⚙️  Seeding app settings...');
  await writeDocument(token, 'settings', 'appConfig', DEFAULT_SETTINGS);
  console.log('  ✓ appConfig (commission 3%, fees, withdrawal rules, etc.)');

  // 3. Prohibited keywords
  console.log('\n🚫 Seeding prohibited keywords...');
  await writeDocument(token, 'settings', 'prohibited-keywords', {
    keywords: PROHIBITED_KEYWORDS.join(','),
    updatedAt: new Date().toISOString(),
  });
  console.log(`  ✓ prohibited-keywords (${PROHIBITED_KEYWORDS.length} keywords)`);

  console.log('\n🎉 Seed selesai!');
  console.log(`\nVerifikasi: https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data`);
  console.log('\nAnda sekarang bisa:');
  console.log('  1. Register user via aplikasi (BUYER/SELLER/COURIER)');
  console.log('  2. Buyer home page akan tampilkan 9 kategori yang sudah di-seed');
  console.log('\nUntuk promote user ke ADMIN:');
  console.log(`  1. Buka: https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fusers`);
  console.log('  2. Edit user doc → set field "role" = "ADMIN"');
  console.log('  3. Save');
}

main().catch((err) => {
  console.error('\n❌ Seed gagal:', err.message);
  console.error('\nPastikan:');
  console.error('  1. Sudah login: npx firebase login');
  console.error('  2. Project ID benar: tokowarung-15b64');
  console.error('  3. Punya akses ke project ini di Firebase Console');
  process.exit(1);
});
