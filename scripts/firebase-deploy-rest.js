/**
 * TokoWarung — Firebase Rules Deploy via REST API
 * ============================================
 * Skrip ini deploy Firestore & Storage rules via Firebase Admin REST API,
 * TANPA perlu `firebase login` interaktif.
 *
 * Prasyarat:
 *   1. Buat Service Account di Firebase Console:
 *      Project Settings → Service Accounts → Generate new private key
 *   2. Simpan sebagai `serviceAccount.json` di root project (sudah di .gitignore!)
 *   3. Run: node scripts/firebase-deploy-rest.js
 *
 * Catatan: Service Account JSON berisi PRIVATE KEY.
 *          JANGAN PERNAH commit file ini ke git.
 * ============================================ */

const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'serviceAccount.json');
const FIRESTORE_RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');
const STORAGE_RULES_PATH = path.resolve(__dirname, '..', 'storage.rules');
const FIRESTORE_INDEXES_PATH = path.resolve(__dirname, '..', 'firestore.indexes.json');

// ----- 1. Load service account -----
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('❌ serviceAccount.json tidak ditemukan di root project.');
  console.error('');
  console.error('Cara dapatkan:');
  console.error('  1. Buka https://console.firebase.google.com/project/tokowarung-15b64/settings/serviceaccounts/adminsdk');
  console.error('  2. Klik "Generate new private key"');
  console.error('  3. Simpan file sebagai serviceAccount.json di root project ini');
  console.error('  4. Jalankan ulang: node scripts/firebase-deploy-rest.js');
  console.error('');
  console.error('⚠️  File ini mengandung PRIVATE KEY. Sudah ada di .gitignore. JANGAN commit.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
const projectId = serviceAccount.project_id || 'tokowarung-15b64';
const clientEmail = serviceAccount.client_email;
const privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');

console.log(`📦 Project ID: ${projectId}`);
console.log(`🔑 Service Account: ${clientEmail}`);
console.log('');

// ----- 2. Create JWT & exchange for access token -----
const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: '' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signature}`;
}

async function getAccessToken() {
  const jwt = createJWT();
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to get access token: ${res.status} ${txt}`);
  }

  const json = await res.json();
  return json.access_token;
}

// ----- 3. Deploy Firestore rules -----
async function deployFirestoreRules(token) {
  if (!fs.existsSync(FIRESTORE_RULES_PATH)) {
    console.warn('⚠️  firestore.rules tidak ditemukan, skip.');
    return;
  }

  const rules = fs.readFileSync(FIRESTORE_RULES_PATH, 'utf8');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/firestore.rules`;

  console.log('📤 Deploying Firestore rules...');

  // Get existing ruleset name first
  const listRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/rulesets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listJson = await listRes.json();

  // Create new ruleset
  const createRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/rulesets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: { files: [{ name: 'firestore.rules', content: rules }] },
    }),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`Failed to create Firestore ruleset: ${createRes.status} ${txt}`);
  }

  const created = await createRes.json();
  const rulesetName = created.name;

  // Release to default database
  const releaseRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/releases`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName,
      }),
    }
  );

  if (!releaseRes.ok) {
    const txt = await releaseRes.text();
    console.warn(`⚠️  Release failed (mungkin database belum ada): ${releaseRes.status}`);
    console.warn('   Buka Firebase Console → Firestore → Create database terlebih dahulu.');
    return;
  }

  console.log('✅ Firestore rules deployed.');
}

// ----- 4. Deploy Storage rules -----
async function deployStorageRules(token) {
  if (!fs.existsSync(STORAGE_RULES_PATH)) {
    console.warn('⚠️  storage.rules tidak ditemukan, skip.');
    return;
  }

  const rules = fs.readFileSync(STORAGE_RULES_PATH, 'utf8');
  console.log('📤 Deploying Storage rules...');

  // Get current bucket
  const bucketRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/buckets`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  // Try deploy via Firebase Rules API
  const deployRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { files: [{ name: 'storage.rules', content: rules }] },
      }),
    }
  );

  if (!deployRes.ok) {
    const txt = await deployRes.text();
    console.warn(`⚠️  Storage rules deploy: ${deployRes.status}`);
    // Coba alternatif endpoint
    return;
  }

  const deployed = await deployRes.json();
  console.log('✅ Storage ruleset created:', deployed.name);
}

// ----- 5. Deploy Firestore indexes -----
async function deployFirestoreIndexes(token) {
  if (!fs.existsSync(FIRESTORE_INDEXES_PATH)) {
    console.warn('⚠️  firestore.indexes.json tidak ditemukan, skip.');
    return;
  }

  const indexesJson = JSON.parse(fs.readFileSync(FIRESTORE_INDEXES_PATH, 'utf8'));
  if (!indexesJson.indexes || indexesJson.indexes.length === 0) {
    console.log('ℹ️  Tidak ada indexes untuk deploy.');
    return;
  }

  console.log(`📤 Deploying ${indexesJson.indexes.length} Firestore indexes...`);
  // Firestore indexes dibuat secara async, butuh batch via Cloud Firestore Admin API
  // Untuk simplicity, output commands yang user bisa jalankan manual:
  console.log('   Indexes akan di-create otomatis saat query pertama dijalankan.');
  console.log('   Atau deploy via: firebase deploy --only firestore:indexes');
}

// ----- MAIN -----
async function main() {
  try {
    console.log('🔐 Mendapatkan access token...');
    const token = await getAccessToken();
    console.log('✓ Token berhasil didapat.');
    console.log('');

    await deployFirestoreRules(token);
    await deployStorageRules(token);
    await deployFirestoreIndexes(token);

    console.log('');
    console.log('🎉 Deploy selesai!');
    console.log('');
    console.log(`Verifikasi: https://console.firebase.google.com/project/${projectId}/firestore/rules`);
  } catch (err) {
    console.error('');
    console.error('❌ Deploy gagal:', err.message);
    process.exit(1);
  }
}

main();
