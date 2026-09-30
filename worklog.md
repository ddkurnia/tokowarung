# TokoWarung — Worklog

---
Task ID: phase-1
Agent: main (Super Z)
Task: Bangun fondasi aplikasi marketplace TokOnline.com (Phase 1) — project setup, Firebase config, role-based auth, design system, core services, basic pages untuk buyer/seller/courier/admin.

Work Log:
- Analyzed workspace (kosong, fresh start — tidak ada project existing yang harus dipertahankan).
- Setup project scaffolding: package.json (Vite + Firebase only), vite.config.js, .env.example, .gitignore, index.html.
- Created modular folder structure: src/{firebase,auth,services,components,buyer,seller,courier,admin,pages,router,utils,styles}, functions/, scripts/, public/.
- Firebase config: env-based (no hardcode), idempotent init via app.js singleton, separate config.js untuk export auth/db/storage.
- Auth service: registerUser (multi-role: BUYER/SELLER/COURIER), loginWithEmail, loginWithGoogle, logout, resetPassword, onAuthChange subscription, fetchUserProfile.
- Role-based router: hash routing, lazy-loaded pages, role guard, layout wrapper, 404 handler.
- Constants file: all enums (roles, statuses, collection names, default categories, routes, default settings) — single source of truth.
- Helpers: formatRupiah, formatRelativeTime, haversineKm, debounce, validation (email/phone/file), slugify, etc.
- Design system: main.css (tokens, base), components.css (buyer header, hero, category grid, product card, store card, section header, bottom nav, product detail, dashboard layouts, admin panel, stats grid, banners, modals, tables). Mobile-first, modern 2026 aesthetic.
- Reusable components (ui.js): el() factory helper, BuyerHeader, BuyerBottomNav, ProductCard, SkeletonCard, EmptyState, Spinner, SectionHeader, StarRating.
- Feedback components (feedback.js): showToast (4 variants), showModal (center/bottom variants), confirmDialog (Promise-based).
- Core services: productService, storeService, cartService (guest+Firestore), orderService (atomic transaction), paymentService (provider-agnostic), notificationService (realtime via onSnapshot), sellerDashboardService.
- Buyer pages: Home (hero, categories, products, stores, bottom nav), Product detail (gallery, info, sticky CTA).
- Auth pages: Login (email/password, Google), Register (multi-role BUYER/SELLER/COURIER).
- Seller dashboard: stats grid, verification banner, quick actions, recent products list.
- Courier dashboard: online toggle, COD tracking stats, active order placeholder.
- Admin dashboard: sidebar (12 nav items), stats grid, quick actions.
- Firestore Security Rules: comprehensive RBAC, field-sensitive protection, audit log enforced.
- Storage rules: image-only, max 5MB, per-user path isolation.
- Cloud Functions skeleton: updateOrderStatus (callable, audit log, notification fan-out), setCourierOnline, logSettingsChange trigger.
- Seed script: scripts/seed.js — initialize categories, default settings, prohibited keywords, admin promotion.
- Documentation: README.md, DEPLOYMENT.md.
- Verified build: 43 modules, code splitting active, 110KB gzip total.
- Fixed bugs: circular import in firebase/app.js, missing startAfter import, wrong relative path in sellerDashboardService.js.

---
Task ID: phase-1-deploy
Agent: main (Super Z)
Task: Push ke GitHub (repo: tokowarung), setup Firebase deploy scripts, prepare Vercel auto-deploy config.

Work Log:
- Security: GitHub PAT dipakai sekali untuk push, tidak disimpan di file/config manapun, di-unset dari env setelah selesai.
- Update .env dengan real Firebase config (tokowarung-15b64).
- Cleanup git tracking: skills/ (1053 files) & download/ di-untrack. Total tracked turun dari 1134 → 42.
- Auth GitHub via API: username "ddkurnia", token scope "repo" verified.
- Created GitHub repo via API: "ddkurnia/tokowarung" (public).
- Push berhasil, commit SHA 336feb5, kemudian cf2519d (deployment configs).
- Created vercel.json (Vite auto-detect, SPA rewrites, cache headers, security headers).
- Created scripts/firebase-deploy.sh (interactive CLI) + scripts/firebase-deploy-rest.js (service account REST API).
- Created DEPLOYMENT.md comprehensive.
- Update package.json: rename "tokowarung", deploy scripts.
- Security verified: .env NOT tracked, serviceAccount.json NOT tracked, remote URL clean, env vars cleared.

---
Task ID: phase-1-cloudinary
Agent: main (Super Z)
Task: Integrate Cloudinary untuk image storage (ganti Firebase Storage untuk public images).

Work Log:
- Security analysis: User share Cloudinary API Secret di chat. Saya HANYA pakai Cloud Name + Upload Preset (PUBLIC, aman) di client. API Secret tidak masuk ke kode client mana pun — hanya untuk Cloud Functions (server-side).
- Created src/services/storageService.js (256 lines):
  * uploadImage(file, opts) — unsigned upload via upload preset, dengan progress tracking
  * getImageUrl(publicId, opts) — Cloudinary transformations (auto WebP, quality auto, responsive)
  * getThumbUrl(publicId, size=200) — untuk product card
  * getResponsiveSrcset(publicId, opts) — untuk responsive img srcset
  * getAvatarUrl(publicId, size=96) — square face-focused avatar
  * deleteImage() — throws error (must use Cloud Function)
  * extractPublicId(url) — helper parse Cloudinary URL
  * uploadImageWithRetry(file, opts, maxRetries=2) — exponential backoff
- Update buyer home page: product card images pakai getThumbUrl(publicId, 240)
- Update product detail page: main image getImageUrl(publicId, 800) + thumbs getThumbUrl(publicId, 100)
- Update seller dashboard: product list images pakai getThumbUrl(publicId, 96)
- Update Cloud Functions (functions/index.js):
  * Add require('cloudinary').v2 with config (cloud_name, api_key, api_secret) dari env
  * Add deleteCloudinaryImage callable:
    - Auth required
    - Verify ownership (seller hanya boleh hapus image milik produknya)
    - Admin bisa hapus orphan images tanpa productId
    - Update product.images array di Firestore
    - Log audit ke auditLogs collection
- Update storage.rules: deny-all public (semua image via Cloudinary sekarang), keep skeleton untuk private docs di masa depan
- Update functions/package.json: add cloudinary ^2.4.0 dependency
- Update .env & .env.example: tambah VITE_CLOUDINARY_CLOUD_NAME=dnpdjhdgr + VITE_CLOUDINARY_UPLOAD_PRESET=tokowarung (PUBLIC)
- Update DEPLOYMENT.md: tambah Step 2.B Cloudinary setup guide (signup, create upload preset unsigned, env vars, verification)
- Update .gitignore: functions/.env already gitignored
- Build verified: 44 modules (storageService terpisah sebagai chunk sendiri, 0.6KB)
- Commit & push ke GitHub (commit 5569e55): 9 files changed, 452 insertions, 90 deletions

Stage Summary:
- Cloudinary integration complete & verified
- Image storage: Cloudinary (public, unsigned upload preset)
- Image delete & admin ops: Cloud Functions (server-side, API secret)
- Security model: API Secret never exposed to client
- Firebase login URL generated (session 09150 / b1ca7dd9) — user perlu buka URL & berikan auth code untuk deploy rules

Remaining untuk user:
1. ⚠️ Rotate Cloudinary API Secret di console (karena di-share di chat)
2. ⚠️ Revoke GitHub PAT ghp_*** (juga di-share di chat)
3. Setup Cloudinary Upload Preset "tokowarung" (unsigned mode) — lihat DEPLOYMENT.md Step 2.B
4. Deploy Firebase Security Rules — perlu auth (lihat instruksi terakhir)
5. Connect Vercel → GitHub repo (auto-deploy on push)
