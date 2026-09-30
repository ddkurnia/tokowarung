// ============================================
// TokoWarung — Demo Products Seed Script
// ============================================
// Tambahkan produk demo supaya buyer flow bisa di-test end-to-end.
//
// PRASYARAT:
//   1. Sudah login firebase: npx firebase login
//   2. Project aktif: tokowarung-15b64
//   3. Sudah register minimal 1 akun SELLER via aplikasi
//      (firebase console → Authentication → copy UID)
//
// CARA PAKAI:
//   node scripts/seed-demo-products.mjs <SELLER_UID>
//
// CONTOH:
//   node scripts/seed-demo-products.mjs abc123def456ghi789
// ============================================

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const PROJECT_ID = 'tokowarung-15b64';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Firebase-tools public OAuth client credentials (sudah public di firebase-tools source code).
// Ini bukan secret — Google OAuth "installed app" clients treat these as public identifiers.
// Sumber: https://github.com/firebase/firebase-tools/blob/master/src/api.ts
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// ----- Ambil seller UID dari command line arg -----
const SELLER_UID = process.argv[2];

if (!SELLER_UID) {
  console.error('❌ Usage: node scripts/seed-demo-products.mjs <SELLER_UID>');
  console.error('');
  console.error('Cara dapatkan SELLER_UID:');
  console.error('  1. Buka https://console.firebase.google.com/project/tokowarung-15b64/authentication/users');
  console.error('  2. Cari user yang register sebagai SELLER');
  console.error('  3. Copy User UID (string panjang seperti: 8xXxXxXxXxXxXxXxXxXx)');
  console.error('  4. Jalankan: node scripts/seed-demo-products.mjs <PASTE_UID>');
  process.exit(1);
}

// ----- DEMO PRODUK -----
const DEMO_PRODUCTS = [
  {
    id: 'beras-premium-5kg',
    name: 'Beras Premium Pandan Wangi 5kg',
    description: 'Beras premium pandan wangi dari petani lokal. Pulen, harum, cocok untuk makan harian keluarga.',
    price: 65000,
    originalPrice: 75000,
    stock: 50,
    weight: 5000,
    category: 'sembako',
    categoryName: 'Sembako',
    images: [{
      publicId: 'tokowarung/beras-premium-5kg',
      url: 'https://res.cloudinary.com/dnpdjhdgr/image/upload/v1/tokowarung/beras-premium-5kg',
    }],
    tags: ['beras', 'sembako', 'premium'],
  },
  {
    id: 'minyak-goreng-2l',
    name: 'Minyak Goreng Bimoli 2 Liter',
    description: 'Minyak goreng kualitas premium, jernih dan tahan panas. Untuk memasak sehari-hari.',
    price: 38000,
    originalPrice: null,
    stock: 30,
    weight: 2000,
    category: 'sembako',
    categoryName: 'Sembako',
    images: [],
    tags: ['minyak', 'goreng', 'sembako'],
  },
  {
    id: 'gula-merah-1kg',
    name: 'Gula Merah Asli 1kg',
    description: 'Gula merah asli dari Aren. Manis alami, cocok untuk masakan tradisional.',
    price: 25000,
    originalPrice: 30000,
    stock: 25,
    weight: 1000,
    category: 'sembako',
    categoryName: 'Sembako',
    images: [],
    tags: ['gula', 'merah', 'aren'],
  },
  {
    id: 'mie-goreng-special',
    name: 'Mie Goreng Spesial Pak Budi',
    description: 'Mie goreng spesial dengan bumbu rahasia. Porsi besar, topping ayam suwir & telur. Bisa request level pedas.',
    price: 18000,
    originalPrice: 22000,
    stock: 100,
    weight: 500,
    category: 'kuliner',
    categoryName: 'Kuliner',
    images: [],
    tags: ['mie', 'goreng', 'kuliner'],
  },
  {
    id: 'nasi-uduk-komplit',
    name: 'Nasi Uduk Komplit Bu Siti',
    description: 'Nasi uduk gurih dengan ayam goreng, telur balado, dan sambal terasi. Paket lengkap untuk 1 orang.',
    price: 22000,
    originalPrice: null,
    stock: 50,
    weight: 600,
    category: 'kuliner',
    categoryName: 'Kuliner',
    images: [],
    tags: ['nasi', 'uduk', 'kuliner'],
  },
  {
    id: 'kopi-robusta-250g',
    name: 'Kopi Robusta Gayo 250g',
    description: 'Kopi robusta single origin dari Gayo, Aceh. Body tebal, aftertaste coklat. Freshly roasted.',
    price: 45000,
    originalPrice: 55000,
    stock: 40,
    weight: 250,
    category: 'kuliner',
    categoryName: 'Kuliner',
    images: [],
    tags: ['kopi', 'robusta', 'gayo'],
  },
  {
    id: 'sabun-cuci-piring-800ml',
    name: 'Sabun Cuci Piring 800ml (Sunlight)',
    description: 'Sabun cuci piring Sunlight 800ml. Lemon fresh, hemat, kuat melawan lemak.',
    price: 17000,
    originalPrice: 20000,
    stock: 60,
    weight: 800,
    category: 'rumah-tangga',
    categoryName: 'Rumah Tangga',
    images: [],
    tags: ['sabun', 'cuci', 'piring'],
  },
  {
    id: 'air-mineral-600ml-isi-12',
    name: 'Air Mineral 600ml (isi 12 botol)',
    description: 'Air mineral 600ml isi 12 botol. Segar, praktis untuk dibawa bepergian.',
    price: 24000,
    originalPrice: null,
    stock: 35,
    weight: 7500,
    category: 'sembako',
    categoryName: 'Sembako',
    images: [],
    tags: ['air', 'mineral', 'minum'],
  },
  {
    id: 'telur-ayam-1kg',
    name: 'Telur Ayam Negeri 1kg (isi 18-20 butir)',
    description: 'Telur ayam negeri segar, dipanen langsung dari farm. Tidak retak, kualitas premium.',
    price: 28000,
    originalPrice: 32000,
    stock: 40,
    weight: 1000,
    category: 'sembako',
    categoryName: 'Sembako',
    images: [],
    tags: ['telur', 'ayam', 'sembako'],
  },
  {
    id: 'kopi-sachet-3in1-10pcs',
    name: 'Kopi Sachet 3in1 (isi 10 pcs)',
    description: 'Kopi instan 3in1 sachet isi 10 pcs. Praktis buat sarapan pagi.',
    price: 14000,
    originalPrice: 17000,
    stock: 80,
    weight: 200,
    category: 'kuliner',
    categoryName: 'Kuliner',
    images: [],
    tags: ['kopi', 'sachet', 'instan'],
  },
];

// ============================================
// Get access token via firebase-tools refresh
// ============================================
async function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Belum login firebase. Run: npx firebase login');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('Tidak ada refresh_token. Run: npx firebase login');
  }

  const clientId = FIREBASE_CLI_CLIENT_ID;
  const clientSecret = FIREBASE_CLI_CLIENT_SECRET;

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
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFirestoreValue(val);
    return { mapValue: { fields } };
  }
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
  console.log('🛍️  TokoWarung Demo Products Seed');
  console.log(`   Seller UID: ${SELLER_UID}`);
  console.log(`   Project: ${PROJECT_ID}`);
  console.log('');

  const token = await getAccessToken();
  console.log('✓ Access token obtained.\n');

  // 1. Pastikan seller sudah VERIFIED (sekarang kita set VERIFIED)
  console.log('🏪 Verifying seller profile...');
  const sellerUpdate = {
    verificationStatus: 'VERIFIED',
    storeName: 'Toko Demo TokoWarung',
    ownerName: 'Demo Seller',
    phone: '081234567890',
    address: 'Jl. Demo Toko No. 1, Jakarta',
    location: { lat: -6.2, lng: 106.8 },
    businessType: 'Sembako & Kuliner',
    isOpen: true,
    serviceRadiusKm: 10,
    rating: 4.8,
    totalRatings: 12,
    totalSales: 0,
    todayRevenue: 0,
    monthRevenue: 0,
    newOrders: 0,
    wallet: { available: 0, pending: 0, withdrawn: 0, commission: 0, refund: 0, adjustment: 0 },
  };
  await writeDocument(token, 'sellers', SELLER_UID, sellerUpdate);
  console.log('  ✓ Seller profile VERIFIED & ready\n');

  // 2. Set user role to SELLER (in case masih PENDING_VERIFICATION)
  // Catatan: firestore rules mencegah user self-approve, tapi pakai admin token bypass
  const userUpdate = {
    role: 'SELLER',
    status: 'ACTIVE',
    sellerId: SELLER_UID,
  };
  await writeDocument(token, 'users', SELLER_UID, userUpdate);
  console.log('  ✓ User role set to SELLER (ACTIVE)\n');

  // 3. Add demo products
  console.log(`📦 Adding ${DEMO_PRODUCTS.length} demo products...`);
  for (const p of DEMO_PRODUCTS) {
    const productData = {
      ...p,
      sellerId: SELLER_UID,
      sellerName: 'Toko Demo TokoWarung',
      sellerLocation: { lat: -6.2, lng: 106.8 },
      status: 'APPROVED',
      isActive: true,
      soldCount: Math.floor(Math.random() * 100),
      rating: 4 + Math.random(),
      totalRatings: Math.floor(Math.random() * 50),
      variants: [],
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'seed-script',
    };
    await writeDocument(token, 'products', p.id, productData);
    console.log(`  ✓ ${p.categoryName} — ${p.name} (Rp ${p.price.toLocaleString('id-ID')})`);
  }

  console.log('\n🎉 Demo products seed selesai!');
  console.log('\nSekarang buyer bisa:');
  console.log('  1. Buka aplikasi → halaman home');
  console.log('  2. Lihat 10 produk demo di section "Produk Terlaris"');
  console.log('  3. Klik produk → lihat detail → Add to cart');
  console.log('  4. Cart page → Checkout → buat order');
  console.log('  5. Order success → order detail (timeline status)');
  console.log('  6. Login sebagai seller untuk lihat order masuk');
  console.log(`\nVerifikasi: https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fproducts`);
}

main().catch((err) => {
  console.error('\n❌ Seed gagal:', err.message);
  process.exit(1);
});
