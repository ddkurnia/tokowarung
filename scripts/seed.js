// ============================================
// TokOnline — Firestore Seed Script
// Jalankan satu kali untuk inisialisasi data dasar:
//   - Categories
//   - Default settings
//   - Admin user (jika diperlukan)
//
// Cara pakai:
//   1. Set ADMIN_UID env var (UID user yang sudah diregister & ingin dijadikan admin)
//      dari Firebase Console → Authentication → Users
//   2. jalankan: node scripts/seed.js
//
// Catatan: jalankan dari environment yang punya Firebase Admin SDK
// (service account). JANGAN jalankan dari client.
// ============================================

const path = require('path');
const fs = require('fs');

// Cek file .env
const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ File .env tidak ditemukan. Salin .env.example menjadi .env dulu.');
  process.exit(1);
}

require('dotenv').config({ path: envPath });

// Pakai firebase-admin (server-side)
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('❌ firebase-admin belum terinstall. Jalankan: cd scripts && npm install firebase-admin dotenv');
  process.exit(1);
}

// Init dengan Application Default Credentials (saat pakai firebase login),
// atau dengan service account file (untuk CI/CD).
const serviceAccountPath = path.resolve(__dirname, '..', 'serviceAccount.json');
let app;

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
  });
} else {
  app = admin.initializeApp();
}

const db = admin.firestore();

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

const PROHIBITED_KEYWORDS = {
  id: 'prohibited-keywords',
  keywords: [
    'obat keras', 'psikotropika', 'narkoba', 'ganja', 'sabu', 'ekstasi',
    'senjata api', 'amunisi', 'bahan peledak', 'pisau lipat',
    'pornografi', 'konten dewasa', 'jasa dating', 'jasa pekerja',
    'rokok elektrik tanpa izin', 'minuman keras tanpa izin',
    'uang palsu', 'tiket palsu', 'dokumen palsu',
  ],
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

// ----- SEED FUNCTIONS -----

async function seedCategories() {
  console.log('📂 Seeding categories...');
  const batch = db.batch();
  for (const cat of CATEGORIES) {
    const ref = db.collection('categories').doc(cat.id);
    batch.set(ref, { ...cat, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  console.log(`✅ ${CATEGORIES.length} categories seeded.`);
}

async function seedSettings() {
  console.log('⚙️  Seeding settings...');
  const ref = db.collection('settings').doc('appConfig');
  await ref.set({ ...DEFAULT_SETTINGS, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log('✅ App settings seeded.');

  const pkRef = db.collection('settings').doc('prohibited-keywords');
  await pkRef.set(PROHIBITED_KEYWORDS, { merge: true });
  console.log('✅ Prohibited keywords seeded.');
}

async function promoteAdmin(uid) {
  if (!uid) {
    console.log('ℹ️  ADMIN_UID not set, skipping admin promotion.');
    return;
  }
  console.log(`👑 Promoting user ${uid} to ADMIN role...`);
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.warn(`⚠️  User ${uid} tidak ditemukan di collection users. Daftar dulu via aplikasi.`);
    return;
  }
  await ref.update({ role: 'ADMIN', status: 'ACTIVE', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`✅ User ${uid} sekarang role=ADMIN.`);
}

async function main() {
  try {
    await seedCategories();
    await seedSettings();
    await promoteAdmin(process.env.ADMIN_UID);
    console.log('\n🎉 Seeding selesai! TokOnline siap dipakai.');
    console.log('   Selanjutnya: buka aplikasi di browser dan register user untuk testing.');
  } catch (err) {
    console.error('❌ Seed gagal:', err);
    process.exit(1);
  } finally {
    await app.delete();
  }
}

main();
