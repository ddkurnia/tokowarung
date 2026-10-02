// ============================================
// TokoWarung — Auto-Verify Script (untuk testing cepat)
// ============================================
// Verify SEMUA seller & courier yang PENDING.
// Jalankan: node scripts/auto-verify.mjs
// ============================================

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const PROJECT_ID = 'tokowarung-15b64';
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

async function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Belum login firebase. Run: npx firebase login');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) throw new Error('Tidak ada refresh token. Run: npx firebase login');

  const body = new URLSearchParams({
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return { fields };
}

async function patchDocument(token, collection, docId, fieldsObj) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const body = toFirestoreFields(fieldsObj);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed ${collection}/${docId}: ${res.status} ${txt}`);
  }
  return res.json();
}

async function listCollection(token, collection, pageSize = 100) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}?pageSize=${pageSize}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to list ${collection}: ${res.status}`);
  const data = await res.json();
  return data.documents || [];
}

async function main() {
  console.log('🔧 TokoWarung Auto-Verify Script\n');
  console.log('   Project: ' + PROJECT_ID);
  console.log('');

  const token = await getAccessToken();
  console.log('✓ Access token obtained.\n');

  // 1. Verify ALL sellers
  console.log('🏪 Verifying ALL pending sellers...');
  const sellers = await listCollection(token, 'sellers', 100);
  let verifiedSellers = 0;
  for (const doc of sellers) {
    const uid = doc.name.split('/').pop();
    const status = doc.fields?.verificationStatus?.stringValue;
    if (status !== 'VERIFIED') {
      await patchDocument(token, 'sellers', uid, {
        verificationStatus: 'VERIFIED',
        isOpen: true,
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✓ Seller ${uid.slice(0, 12)}... verified!`);
      verifiedSellers++;
    }
  }
  console.log(`  → ${verifiedSellers} sellers verified. ${sellers.length - verifiedSellers} already verified.\n`);

  // 2. Verify ALL couriers
  console.log('🛵 Verifying ALL pending couriers...');
  const couriers = await listCollection(token, 'couriers', 100);
  let verifiedCouriers = 0;
  for (const doc of couriers) {
    const uid = doc.name.split('/').pop();
    const status = doc.fields?.status?.stringValue;
    if (status !== 'VERIFIED') {
      await patchDocument(token, 'couriers', uid, {
        status: 'VERIFIED',
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✓ Courier ${uid.slice(0, 12)}... verified!`);
      verifiedCouriers++;
    }
  }
  console.log(`  → ${verifiedCouriers} couriers verified. ${couriers.length - verifiedCouriers} already verified.\n`);

  // 3. Ensure users collection has correct roles
  console.log('👤 Checking users collection roles...');
  const users = await listCollection(token, 'users', 100);
  let fixedRoles = 0;
  for (const doc of users) {
    const uid = doc.name.split('/').pop();
    const role = doc.fields?.role?.stringValue;
    const userStatus = doc.fields?.status?.stringValue;
    if (role && userStatus !== 'ACTIVE') {
      await patchDocument(token, 'users', uid, {
        status: 'ACTIVE',
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✓ User ${uid.slice(0, 12)}... (${role}) set to ACTIVE`);
      fixedRoles++;
    }
  }
  console.log(`  → ${fixedRoles} users set to ACTIVE.\n`);

  console.log('🎉 Auto-verify selesai!\n');
  console.log('Sekarang:');
  console.log('  - Seller login → /seller (dashboard lengkap, banner hilang)');
  console.log('  - Courier login → /courier (online toggle muncul)');
  console.log('  - Cek di: https://tokowarung-15b64.web.app');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
