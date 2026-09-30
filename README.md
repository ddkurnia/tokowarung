# TokOnline.com — Local Marketplace 2026

> Marketplace lokal modern yang menghubungkan **Buyer**, **Seller**, **Courier**, dan **Admin** dalam satu ekosistem. Fokus pada toko, warung, UMKM, kuliner, dan bisnis lokal.

## Status: Phase 1 (Fondasi)

Modul yang sudah dibangun:
- [x] Project setup (Vite + Vanilla JS, modular folders)
- [x] Firebase config (env vars, no hardcode)
- [x] Auth & role system (BUYER, SELLER, COURIER, ADMIN, SUPER_ADMIN)
- [x] Role-based router (hash routing, mobile-first)
- [x] Firestore Security Rules (strict, role-based)
- [x] Storage Rules (image-only, max 5MB)
- [x] Design system 2026 (CSS variables, typography, components)
- [x] Core services (product, store, cart, order, payment, notification)
- [x] Buyer app shell: home page (hero, categories, products, stores)
- [x] Buyer app: product detail page (gallery, info, sticky action bar)
- [x] Login & Register pages (multi-role)
- [x] Seller dashboard shell (sidebar, stats, quick actions)
- [x] Courier dashboard shell (online toggle, stats, COD tracking)
- [x] Admin panel shell (sidebar, stats, moderation queue)
- [x] Cloud Functions skeleton (updateOrderStatus, setCourierOnline, audit log trigger)
- [x] Seed script (categories, default settings, admin promotion)
- [x] Documentation

Modul Phase 2-6 (TODO — lihat `MASTER_PROMPT`):
- [ ] Cart page (multi-seller, per-seller subtotal)
- [ ] Checkout flow (alamat, payment method, order summary)
- [ ] Order tracking page (buyer)
- [ ] Seller product CRUD UI
- [ ] Seller order management UI
- [ ] Courier order accept/reject flow
- [ ] Pickup & delivery verification (QR/OTP)
- [ ] COD reconciliation
- [ ] Wallet & withdrawal UI
- [ ] Moderation queue UI
- [ ] Report & dispute center
- [ ] Promotion & voucher system
- [ ] Chat (buyer ↔ seller / courier)
- [ ] Admin operational map
- [ ] Smart dispatch engine
- [ ] Analytics dashboard
- [ ] POS integration
- [ ] Ads system

---

## Tech Stack

| Layer | Teknologi | Alasan |
|---|---|---|
| Frontend | Vanilla JS + Vite | Cepat, modular, no framework overhead |
| Backend | Firebase Auth + Firestore + Storage | Managed, scalable, secure-by-default |
| Server logic | Cloud Functions (Node 18) | Untuk operasi finansial & audit |
| Routing | Hash routing | Simple, works on static hosting |
| Deployment | Vercel (frontend) + Firebase (backend) | Auto-deploy via Git |
| Maps | Leaflet/OpenStreetMap (TODO) | No Google Maps dependency untuk MVP |

---

## Getting Started

### 1. Prerequisites

- Node.js 18+
- Firebase project (buat di https://console.firebase.google.com)
- Vercel account (untuk deploy frontend)

### 2. Install dependencies

```bash
cd /home/z/my-project
npm install
```

### 3. Setup Firebase

1. Buat project baru di [Firebase Console](https://console.firebase.google.com)
2. Aktifkan:
   - **Authentication** → Sign-in methods → Email/Password & Google
   - **Cloud Firestore** → Create database (Production mode)
   - **Storage** → Get started
3. Project Settings → General → Your apps → Add web app
4. Salin konfigurasi SDK

### 4. Setup environment variables

```bash
cp .env.example .env
```

Edit `.env` dan isi nilai dari Firebase Console:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
```

### 5. Deploy Security Rules

Install Firebase CLI (jika belum):

```bash
npm install -g firebase-tools
firebase login
firebase use --add  # pilih project id
```

Deploy rules:

```bash
firebase deploy --only firestore:rules,storage
```

### 6. Seed initial data

Setup admin SDK service account:
- Firebase Console → Project Settings → Service Accounts → Generate new private key
- Save as `serviceAccount.json` di root project (sudah di .gitignore)

Install firebase-admin:

```bash
cd scripts
npm init -y
npm install firebase-admin dotenv
cd ..
```

Jalankan seed:

```bash
# Optional: set ADMIN_UID untuk promote user tertentu jadi admin
ADMIN_UID=your-uid-from-firebase-auth node scripts/seed.js
```

### 7. Run dev server

```bash
npm run dev
```

Buka http://localhost:5173

### 8. Test the flow

1. Register akun baru (pilih role: Pembeli/Penjual/Kurir)
2. Login
3. Cek dashboard sesuai role
4. Tambah produk sebagai seller (status akan DRAFT)
5. Approve produk via Firebase Console (collection `products`)
6. Lihat produk muncul di buyer home page

---

## Project Structure

```
tokonline/
├── index.html                  # Entry point HTML
├── vite.config.js              # Vite config
├── firebase.json               # Firebase deploy config
├── firestore.rules             # Security rules (CRITICAL)
├── firestore.indexes.json     # Composite indexes
├── storage.rules               # Storage security rules
├── .env.example                # Environment template
├── package.json
│
├── public/                     # Static assets
│   └── favicon.svg
│
├── src/
│   ├── main.js                 # App entry (bootstrap)
│   ├── firebase/
│   │   ├── app.js              # Firebase App singleton
│   │   └── config.js           # Export auth, db, storage
│   ├── auth/
│   │   ├── authService.js      # Login/register/logout
│   │   └── pages/
│   │       ├── login.js
│   │       └── register.js
│   ├── router/
│   │   └── router.js           # Hash router, role-based guard
│   ├── services/               # Data layer ( Firestore wrappers)
│   │   ├── productService.js
│   │   ├── storeService.js
│   │   ├── cartService.js
│   │   ├── orderService.js
│   │   ├── paymentService.js   # Abstraction layer (provider-agnostic)
│   │   ├── notificationService.js
│   │   └── sellerDashboardService.js
│   ├── components/             # Reusable UI components
│   │   ├── ui.js               # Header, BottomNav, ProductCard, etc
│   │   └── feedback.js         # Toast, Modal, ConfirmDialog
│   ├── buyer/pages/            # Buyer-specific pages
│   │   ├── home.js
│   │   └── product-detail.js
│   ├── seller/pages/           # Seller dashboard pages
│   │   └── dashboard.js
│   ├── courier/pages/          # Courier app pages
│   │   └── dashboard.js
│   ├── admin/pages/            # Admin panel pages
│   │   └── dashboard.js
│   ├── pages/
│   │   └── not-found.js        # 404 page
│   ├── styles/
│   │   ├── main.css            # Design tokens, base
│   │   └── components.css      # Component-specific styles
│   └── utils/
│       ├── constants.js        # Roles, statuses, collection names
│       └── helpers.js          # Format rupiah, validation, etc
│
├── functions/                  # Cloud Functions (server-side)
│   ├── package.json
│   └── index.js                # updateOrderStatus, auditLog, etc
│
└── scripts/
    └── seed.js                 # Initial data seeding
```

---

## Security Model

### Defense in Depth

| Layer | Implementation |
|---|---|
| Authentication | Firebase Auth (email/password + Google) |
| Authorization | Role-based access control via Firestore Rules |
| Input validation | Client-side + Firestore Rules `request.resource.data.*` checks |
| Sensitive fields | Stripped from public reads (bank account, identity number) |
| Financial ops | ALL via Cloud Functions (no direct client write to wallets/transactions) |
| File uploads | Storage rules: image-only, max 5MB, per-user path isolation |
| Audit log | Cloud Functions triggers on settings/critical updates |
| XSS | All user content rendered via `textContent` (no `innerHTML` injection) |
| CSRF | N/A (uses Firebase Auth tokens, no cookie-based sessions) |

### Role Permissions Matrix

| Action | Buyer | Seller | Courier | Admin | SuperAdmin |
|---|---|---|---|---|---|
| View approved products | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create product | ❌ | ✅ (DRAFT only) | ❌ | ✅ | ✅ |
| Approve product | ❌ | ❌ | ❌ | ✅ | ✅ |
| Create order | ✅ | ❌ | ❌ | ❌ | ❌ |
| Update order status | (via CF) | (via CF) | (via CF) | (via CF) | (via CF) |
| View own wallet | ❌ | ✅ | ✅ | ❌ | ❌ |
| Approve withdrawal | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update system settings | ❌ | ❌ | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ❌ | ✅ | ✅ |
| Suspend user | ❌ | ❌ | ❌ | ✅ | ✅ |
| Delete user | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Payment System

Payment provider di-inject via dependency injection (`setProvider()` di `paymentService.js`). Interface tetap sama walau provider berganti.

```js
// Example: integrasi Midtrans (saat production-ready)
import { setProvider } from './services/paymentService.js';

setProvider({
  name: 'Midtrans',
  async createPayment({ orderId, amount, method, buyer, seller }) {
    // Call Cloud Function yang hit Midtrans API
    const res = await fetch('/api/createPayment', { method: 'POST', body: JSON.stringify({ orderId, amount, method }) });
    return res.json();
  },
  async refundPayment(providerTxId, amount, reason) {
    const res = await fetch('/api/refund', { method: 'POST', body: JSON.stringify({ providerTxId, amount, reason }) });
    return res.json();
  },
  async calculateFee(amount) {
    return Math.round(amount * 0.007); // 0.7%
  }
});
```

Semua secret (server key) hanya ada di Cloud Functions, BUKAN di client.

---

## Deployment

### Frontend → Vercel

1. Push project ke GitHub
2. Connect repo di Vercel
3. Set Environment Variables di Vercel project settings (sama seperti .env local)
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

### Backend → Firebase

```bash
# Deploy rules & indexes
firebase deploy --only firestore:rules,firestore:indexes,storage

# Deploy Cloud Functions (setelah setup functions/)
cd functions && npm install && cd ..
firebase deploy --only functions
```

---

## Conventions

### Code Style

- **ES Modules** (`import`/`export default`)
- **No framework** — Vanilla DOM API (`document.createElement`)
- **Reusable components** — setiap fungsi return `HTMLElement`
- **CSS variables** — semua warna dari `:root` di `main.css`
- **Type hints via JSDoc** — bantu IDE tanpa TypeScript

### Naming

- **Files**: `camelCase.js` (e.g., `productService.js`)
- **Collections**: `camelCase` (e.g., `sellerWallets`)
- **Status enum**: `UPPER_SNAKE_CASE` (e.g., `PENDING_PAYMENT`)
- **CSS classes**: `BEM-ish` (e.g., `product-card__name`)

### Git Workflow

- `main` branch hanya untuk release yang stabil
- Feature branch: `feat/<module-name>` (e.g., `feat/cart-checkout`)
- Setiap modul selesai → test → commit → PR

---

## Roadmap (Phase 2-6)

### Phase 2: Cart & Checkout & Delivery
- [ ] Cart page (multi-seller grouping, subtotal per seller)
- [ ] Checkout flow (alamat, payment method, order summary)
- [ ] Order status tracking page
- [ ] Courier online/offline toggle (functional)
- [ ] Auto-dispatch engine (Cloud Function)
- [ ] Pickup QR code verification
- [ ] Delivery tracking (geolocation periodic upload)

### Phase 3: Payment & Wallet
- [ ] Midtrans/Xendit integration via Cloud Function
- [ ] Payment webhook handler
- [ ] Seller wallet (pending → available settlement)
- [ ] Courier wallet (earnings + COD)
- [ ] Withdrawal request & admin approval
- [ ] COD reconciliation system

### Phase 4: Moderation & Dispute
- [ ] Admin moderation queue UI
- [ ] Auto-flagging for prohibited keywords
- [ ] Report queue (low/med/high/urgent)
- [ ] Dispute center (buyer vs seller, etc)
- [ ] Incident management
- [ ] Seller violation system

### Phase 5: Engagement
- [ ] Voucher & coupon engine
- [ ] Seller promotion tools
- [ ] Ads system foundation
- [ ] Chat (buyer ↔ seller, buyer ↔ courier)
- [ ] Push notification (FCM)
- [ ] Review & rating system

### Phase 6: Scale
- [ ] Smart dispatch (multi-order, stacked delivery)
- [ ] Algolia integration (full-text search)
- [ ] Analytics dashboard
- [ ] POS integration
- [ ] Fraud detection (risk score engine)
- [ ] Operational map (Leaflet)

---

## Legal & Compliance

File legal yang perlu disiapkan sebelum go-live production (HARAP ditinjau oleh ahli hukum Indonesia):

- [ ] Terms of Service (Terms of Service.html)
- [ ] Privacy Policy (Privacy Policy.html)
- [ ] Seller Agreement
- [ ] Courier Agreement
- [ ] Refund Policy
- [ ] Prohibited Products Policy
- [ ] Community Guidelines
- [ ] Contact
- [ ] Report Abuse

Konten legal yang ada di sini hanya placeholder. Jangan klaim sebagai nasihat hukum.

---

## Anti-Fraud Foundation

Struktur anti-fraud sudah disiapkan (collection `auditLogs`, `violations`, `incidents`), dan field `riskScore` di order/user schema. Implementasi deteksi real-time:

- [ ] Duplicate account detection (same device, phone, IP)
- [ ] Multiple voucher abuse (track redemption history)
- [ ] Suspicious order pattern (unusual high-value COD)
- [ ] Fake reviews (sentiment + behavioral analysis)
- [ ] COD abuse (courier not settling)
- [ ] Seller fraud (fake product, no shipment)
- [ ] Courier fraud (stolen package)

Sinyal tunggal TIDAK boleh langsung blokir — gunakan composite `riskScore` (LOW/MEDIUM/HIGH/CRITICAL) dan trigger manual review.

---

## License

MIT (untuk source code). TokOnline adalah brand dagang — hubungi pemilik untuk penggunaan komersial.

---

## Contact & Support

- Issue tracker: GitHub Issues (saat repo dibuat)
- Email: hello@tokonline.com (placeholder)
- Untuk bug report: sertakan `trace_id` dari console logs
