# TokOnline.com — Worklog

---
Task ID: phase-1
Agent: main (Super Z)
Task: Bangun fondasi aplikasi marketplace TokOnline.com (Phase 1) — project setup, Firebase config, role-based auth, design system, core services, basic pages untuk buyer/seller/courier/admin.

Work Log:
- Analyzed workspace (kosong, fresh start — tidak ada project existing yang harus dipertahankan).
- Setup project scaffolding: package.json (Vite + Firebase only), vite.config.js, .env.example, .gitignore, index.html.
- Created modular folder structure: src/{firebase,auth,services,components,buyer,seller,courier,admin,pages,router,utils,styles}, functions/, scripts/, public/.
- Firebase config: env-based (no hardcode), idempotent init via app.js singleton, separate config.js untuk export auth/db/storage.
- Auth service: registerUser (multi-role: BUYER/SELLER/COURIER), loginWithEmail, loginWithGoogle, logout, resetPassword, onAuthChange subscription, fetchUserProfile. Create seller/courier application docs as PENDING_VERIFICATION on registration.
- Role-based router: hash routing, lazy-loaded pages, role guard, layout wrapper, 404 handler.
- Constants file: all enums (roles, statuses, collection names, default categories, routes, default settings) — single source of truth.
- Helpers: formatRupiah, formatRelativeTime, haversineKm, debounce, validation (email/phone/file), slugify, etc.
- Design system: main.css (tokens, base), components.css (buyer header, hero, category grid, product card, store card, section header, bottom nav, product detail, dashboard layouts, admin panel, stats grid, banners, modals, tables). Mobile-first, modern 2026 aesthetic (subtle shadow, rounded corners, soft borders, good typography, no heavy gradients).
- Reusable components (ui.js): el() factory helper, BuyerHeader, BuyerBottomNav, ProductCard, SkeletonCard, EmptyState, Spinner, SectionHeader, StarRating.
- Feedback components (feedback.js): showToast (4 variants), showModal (center/bottom variants), confirmDialog (Promise-based).
- Core services:
  * productService: listApprovedProducts, searchProducts, listSellerProducts, createProduct (DRAFT only), updateProduct, submitProductForReview, listPendingReviewProducts, approveProduct, rejectProduct, suspendProduct.
  * storeService: getPublicStore (strips sensitive fields), getSellerProfile, updateSellerProfile (blocks sensitive fields), listNearbyStores (MVP client-side geo filter).
  * cartService: addToCart, updateCartQty, removeFromCart, getCart, clearCart, groupBySeller, calculateTotals — supports both Firestore (logged-in) and localStorage (guest).
  * orderService: createOrder (atomic transaction with stock reservation), getOrderById, listBuyerOrders, listSellerOrders, updateOrderStatus (state machine validation), cancelOrder (release stock).
  * paymentService: provider-agnostic abstraction (setProvider, createPayment, getPaymentStatus, refundPayment, calculatePaymentFee). No hardcoded vendor.
  * notificationService: createNotification, subscribeToNotifications (realtime via onSnapshot), markRead, markAllRead.
  * sellerDashboardService: getSellerProfile, listSellerProducts.
- Buyer pages:
  * Home: header (logo, location, search, cart, bell), hero section, category grid, "Produk Terlaris", "Toko Terdekat", "Sedang Promo" sections, bottom nav. Skeleton loading + empty states + error states.
  * Product detail: breadcrumb, gallery (main + thumbs), info (name, rating, price + discount badge, attributes, description, variants, shipping estimate), sticky bottom action bar (wishlist, add to cart, buy now), report button.
- Auth pages:
  * Login: email/password, Google login, reset password, role-aware redirect.
  * Register: role selection cards (BUYER/SELLER/COURIER), name/email/phone/password, validation, prevents ADMIN/SUPER_ADMIN self-registration.
- Seller dashboard: sidebar nav, topbar, verification banner (if not VERIFIED), stats grid (6 cards: omzet today/month, new orders, available/pending balance, rating), quick actions, recent orders placeholder, recent products list.
- Courier dashboard: topbar, online/offline toggle card (large prominent action), 4 stats cards (earnings/COD collected/COD outstanding/rating), active order placeholder, quick links (wallet/history/support).
- Admin dashboard: sidebar (12 nav items), topbar, 6 stat cards, quick actions (review product, verify seller/courier, view reports), recent activity placeholder.
- 404 page: friendly empty state with home/back buttons.
- Firestore Security Rules: comprehensive role-based access — buyer reads own orders, seller reads own products/orders, courier reads assigned orders only, admin all. Blocks field-sensitive updates (verificationStatus, violationLevel, role, status) from non-admin. Order updates ONLY via Cloud Function. Audit logs read-only for admin. Violations never deletable.
- Storage rules: image-only (jpeg/png/webp), max 5MB, per-user path isolation, separate private paths for sellerDocs/courierDocs/orderProof.
- Cloud Functions skeleton: updateOrderStatus (callable, server-side validation, audit log, notification fan-out), setCourierOnline (callable), logSettingsChange (trigger on settings update). TODO comments for autoDispatchCourier, paymentWebhook, settleSellerWallets.
- Seed script: scripts/seed.js — initialize categories, default settings (commission 3%, fees, withdrawal minimum, etc.), prohibited keywords, promote user to ADMIN (via ADMIN_UID env var).
- Documentation: README.md (comprehensive — setup, project structure, security model, payment integration, deployment, roadmap Phase 2-6, anti-fraud foundation, legal reminder).
- Verified build: npm run build succeeds (43 modules, code split firebase/main/app/pages chunks). Dev server boots (HTTP 200 on localhost:5173).
- Fixed bugs during development: circular import in firebase/app.js, missing startAfter import in orderService.js, wrong relative path in sellerDashboardService.js.

Stage Summary:
- Phase 1 fondasi lengkap & berfungsi: 24 source files + 5 config/rules files + 1 Cloud Functions entry + 1 seed script + 1 README. Total ~5000+ lines kode production-grade.
- Build verified: 19.81KB main bundle + 470KB firebase (lazy-loaded), gzip 110KB total.
- Aman & reversible: semua data via Firebase services (no hardcoded secrets), security rules strict, no destructive changes possible dari client.
- Siap lanjut ke Phase 2 (cart page, checkout, order tracking, courier online toggle, auto-dispatch).
- Untuk user: tinggal buat project Firebase, isi .env, deploy rules, jalankan seed, run `npm run dev`.
