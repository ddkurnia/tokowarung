# TokoWarung — Deployment Guide

Panduan lengkap untuk deploy TokoWarung ke production (Firebase + Vercel + GitHub auto-deploy).

---

## Status Saat Ini

✅ **Code sudah di-push ke GitHub**: https://github.com/ddkurnia/tokowarung
✅ **Build verified**: 43 modules, code splitting aktif, 110KB gzip total
✅ **Config Firebase** sudah pakai project `tokowarung-15b64`
⏳ **Security Rules** belum deploy (butuh auth Firebase)
⏳ **Vercel** belum connect (butuh klik di dashboard Vercel)

---

## Step 1: Deploy Firebase Security Rules (PENTING — Wajib)

Ada 2 cara. Pilih salah satu.

### Cara A: Pakai Firebase CLI (Paling Mudah)

Jalankan dari terminal lokal di folder project:

```bash
# 1. Install firebase-tools (kalau belum)
npm install

# 2. Login ke Firebase (browser akan terbuka)
npx firebase login

# 3. Set project
npx firebase use --add tokowarung-15b64

# 4. Deploy Security Rules + Storage Rules
npx firebase deploy --only firestore:rules,firestore:indexes,storage

# 5. (Opsional) Deploy Cloud Functions
cd functions && npm install && cd ..
npx firebase deploy --only functions
```

**Atau jalankan satu script**:

```bash
chmod +x scripts/firebase-deploy.sh
./scripts/firebase-deploy.sh
```

### Cara B: Pakai Service Account JSON (untuk CI/CD)

1. Download service account dari Firebase Console:
   - https://console.firebase.google.com/project/tokowarung-15b64/settings/serviceaccounts/adminsdk
   - Klik **"Generate new private key"**
   - Simpan file sebagai `serviceAccount.json` di root project (sudah di-gitignore, aman)

2. Jalankan:

```bash
node scripts/firebase-deploy-rest.js
```

3. Verifikasi rules sudah ter-deploy:
   - Firestore: https://console.firebase.google.com/project/tokowarung-15b64/firestore/rules
   - Storage: https://console.firebase.google.com/project/tokowarung-15b64/storage/rules

---

## Step 2: Enable Firebase Services di Console

Buka Firebase Console untuk project `tokowarung-15b64` dan enable:

### Authentication ✅ (sudah user aktifkan)
1. https://console.firebase.google.com/project/tokowarung-15b64/authentication/providers
2. Enable **Email/Password** ( jika belum )
3. Enable **Google** (opsional, untuk sign-in cepat)

### Cloud Firestore ✅ (sudah user aktifkan)
1. https://console.firebase.google.com/project/tokowarung-15b64/firestore
2. Database sudah dibuat — verifikasi region `asia-southeast1` (Singapore)
3. Production mode (security rules strict sudah di-deploy)

### Cloud Storage (Opsional — untuk private docs di masa depan)
- **Image storage utama pakai CLOUDINARY** (lihat Step 2.B), BUKAN Firebase Storage
- Firebase Storage rules sudah deny-all untuk public (aman)
- Bila nanti butuh simpan dokumen private (KTP seller, bukti COD), enable di sini

### Cloud Functions (untuk fitur Phase 2+)
1. https://console.firebase.google.com/project/tokowarung-15b64/functions
2. Upgrade ke **Blaze plan** (pay-as-you-go, ada free tier)
3. Set region ke `asia-southeast1`

---

## Step 2.B: Setup Cloudinary (Image Storage)

Image storage utama pakai **Cloudinary** (bukan Firebase Storage) untuk performance & optimization.

### Setup Cloudinary Account

1. Buka https://cloudinary.com → Sign up (free tier: 25 credits)
2. Cloud Name: `dnpdjhdgr` (sudah dikonfigurasi)

### Setup Upload Preset (PENTING)

1. Login ke https://cloudinary.com/console
2. Settings → **Upload** → scroll ke **Upload presets**
3. Klik **"Add upload preset"**:
   - **Name**: `tokowarung` (harus sama persis)
   - **Signing Mode**: **Unsigned** ⚠️ CRITICAL — biar bisa upload dari browser tanpa API secret
   - **Resource type**: Image
   - **Allowed formats**: jpg, png, webp, gif
   - **Max file size**: 5242880 bytes (5 MB)
   - **Unique filename**: Enabled
4. Klik **Save**

### Environment Variables

**Client (PUBLIC, di .env & Vercel):**
- `VITE_CLOUDINARY_CLOUD_NAME` = `dnpdjhdgr`
- `VITE_CLOUDINARY_UPLOAD_PRESET` = `tokowarung`

**Server (RAHASIA, di `functions/.env` — JANGAN commit):**
```
CLOUDINARY_CLOUD_NAME=dnpdjhdgr
CLOUDINARY_API_KEY=742421365262691
CLOUDINARY_API_SECRET=<api-secret-anda>
```

⚠️ **JANGAN commit `functions/.env` ke GitHub!** Sudah ada di `.gitignore`.

### Verifikasi Cloudinary

1. Register sebagai BUYER di aplikasi
2. (Phase 2) Test upload product image sebagai seller
3. Cek https://cloudinary.com/console → Media Library → image muncul
4. Image di app akan tampil sebagai WebP (auto-convert), ukuran lebih kecil

---

## Step 3: Seed Initial Data

Setelah Firestore database aktif, seed data awal (kategori, settings, prohibited keywords):

```bash
# Pastikan sudah login ke firebase (Step 1.A) atau punya serviceAccount.json (Step 1.B)

# Optional: set ADMIN_UID (UID user yang ingin dijadikan ADMIN)
# Cari UID di: https://console.firebase.google.com/project/tokowarung-15b64/authentication/users
# Setelah register user pertama via aplikasi, copy UID-nya:
export ADMIN_UID=<paste-uid-disini>

# Jalankan seed
cd scripts
npm install firebase-admin dotenv
cd ..
node scripts/seed.js
```

---

## Step 4: Setup Vercel Auto-Deploy

Vercel akan auto-deploy setiap kali push ke GitHub. Setup cukup sekali:

### Cara A: Via Vercel Dashboard (Recommended)

1. Buka https://vercel.com → Login dengan GitHub
2. Klik **"Add New"** → **"Project"**
3. Import repository `ddkurnia/tokowarung`
4. Vercel akan auto-detect Vite (lihat `vercel.json` di repo)
5. **TAMBAH ENVIRONMENT VARIABLES** (PENTING!):
   - `VITE_FIREBASE_API_KEY` = `AIzaSyB0Ach9P8CCFo_2sZv0WreBeVQn7_IvnSI`
   - `VITE_FIREBASE_AUTH_DOMAIN` = `tokowarung-15b64.firebaseapp.com`
   - `VITE_FIREBASE_PROJECT_ID` = `tokowarung-15b64`
   - `VITE_FIREBASE_STORAGE_BUCKET` = `tokowarung-15b64.firebasestorage.app`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID` = `164442074468`
   - `VITE_FIREBASE_APP_ID` = `1:164442074468:web:c95a8929a13c935ebe9e71`
   - `VITE_APP_NAME` = `TokoWarung`
6. Klik **"Deploy"**
7. Tunggu ±1 menit → live di `https://tokowarung.vercel.app` (atau URL lain yang Vercel kasih)

### Cara B: Via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
# Saat prompt environment variables, paste nilai dari .env
```

### Custom Domain (Opsional)

Setelah deploy pertama sukses:
1. Vercel Project → Settings → Domains
2. Tambah domain (misal: `tokowarung.com`)
3. Update DNS record di registrar domain (CNAME ke `cname.vercel-dns.com`)

---

## Step 5: Verifikasi Production Live

Buka URL Vercel di browser (mis: `https://tokowarung.vercel.app`).

**Test flow minimal:**
1. ✅ Halaman home tampil (logo TokoWarung, hero, kategori, skeleton loading)
2. ✅ Klik **"Daftar gratis"** → register sebagai BUYER
3. ✅ Cek di Firebase Console → Authentication → ada user baru
4. ✅ Login → diarahkan ke home buyer
5. ✅ Klik **"Masuk"** dengan akun sama → berhasil
6. ✅ Logout → bisa login ulang

**Test role lain** (perlu register akun baru):
1. Register sebagai SELLER → diarahkan ke `/seller` (dashboard, tampil banner "Toko belum terverifikasi")
2. Register sebagai COURIER → diarahkan ke `/courier` (dashboard kurir)
3. Register ADMIN tidak diizinkan dari UI — harus promote via seed script atau langsung edit Firestore collection `users`

**Test security rules:**
1. Login sebagai BUYER
2. Buka Firebase Console → Firestore → coba tambah document di collection `users` dengan UID berbeda → harus **PERMISSION DENIED**
3. Coba tambah document ke collection `auditLogs` → harus **PERMISSION DENIED** (admin-only)

---

## Auto-Deploy Workflow

Setelah semua setup selesai, workflow untuk update aplikasi:

```bash
# 1. Edit code
vim src/buyer/pages/home.js

# 2. Test local
npm run dev

# 3. Build untuk verifikasi
npm run build

# 4. Commit & push
git add -A
git commit -m "feat: tambah X feature"
git push origin main

# 5. Vercel auto-deploy dalam ~30 detik
# 6. Firebase Functions deploy manual (jika ada perubahan):
npx firebase deploy --only functions
```

---

## Troubleshooting

### Error: "Firebase belum dikonfigurasi" di browser
- Cek Environment Variables sudah diset di Vercel dashboard (Step 4 Cara A #5)
- Redeploy di Vercel Project → Deployments → ⋮ → Redeploy

### Error: "PERMISSION_DENIED" saat register user
- Security rules belum deploy (Step 1)
- Atau Firestore database belum di-create (Step 2)

### Error: "user not found" saat login
- User belum register (daftar dulu via UI)
- Atau cek Firebase Console → Authentication → Users

### Vercel deploy error "Build failed"
- Jalankan `npm run build` di lokal dulu untuk lihat error detail
- Cek log di Vercel dashboard → Deployments → klik yang failed → View Build Logs

### Cloud Functions deploy error
- Pastikan project sudah upgrade ke Blaze plan (Cloud Functions butuh billing)
- Cek `functions/package.json` dependencies ter-install

---

## Backup & Disaster Recovery

- **Code**: di GitHub (git history)
- **Firebase config & security rules**: di repo (`firestore.rules`, `storage.rules`, `firestore.indexes.json`)
- **Database data**: Export via `npx fireorm export` atau backup manual di Firebase Console
- **User auth data**: Tidak bisa di-export via client SDK. Untuk backup, pakai gcloud CLI:
  ```bash
  gcloud firestore export gs://tokowarung-15b64.appspot.com/backup-$(date +%Y%m%d)
  ```

---

## Environment Variables Reference

| Variable | Where to Set | Value |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Vercel + .env local | `AIzaSyB0Ach9P8CCFo_2sZv0WreBeVQn7_IvnSI` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Vercel + .env local | `tokowarung-15b64.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Vercel + .env local | `tokowarung-15b64` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Vercel + .env local | `tokowarung-15b64.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Vercel + .env local | `164442074468` |
| `VITE_FIREBASE_APP_ID` | Vercel + .env local | `1:164442074468:web:c95a8929a13c935ebe9e71` |
| `VITE_APP_NAME` | Vercel + .env local | `TokoWarung` |

**Service account JSON** (jika pakai Cara B Step 1):
- File: `serviceAccount.json` di root project
- Status: SUDAH di .gitignore (tidak akan ter-commit)
- Berisi: PRIVATE KEY admin SDK

---

## Security Checklist

- [x] `.env` tidak di-commit ke git (sudah di .gitignore, sudah di-untrack dari history)
- [x] `serviceAccount.json` tidak di-commit (sudah di .gitignore)
- [x] GitHub PAT tidak disimpan permanen di mana pun (hanya dipakai sekali)
- [ ] **WAJIB**: Revoke GitHub PAT yang di-share di chat (https://github.com/settings/tokens)
- [ ] **WAJIB**: Setelah Vercel setup, hapus token dari Vercel project history jika sempat di-paste
- [x] Firestore Security Rules strict (no `allow true`)
- [x] Storage rules: image-only, max 5MB
- [x] Field sensitive (bankAccount, identityNumber) tidak bisa di-read public
- [x] Order status update hanya via Cloud Function
- [x] Audit log collection read-only untuk admin
