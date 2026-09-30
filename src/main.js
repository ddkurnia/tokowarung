// ============================================
// TokOnline — App Entry Point
// Bootstrap: init Firebase, Auth, Router, layout, dsb.
// ============================================

import { initAuth, onAuthChange } from './auth/authService.js';
import { startRouter, registerRoute, setNotFound, setLayout } from './router/router.js';
import { ROUTE, ROLE } from './utils/constants.js';
import { el } from './components/ui.js';

// ----- Pages (lazy-loaded utk code splitting) -----
const LoginPage = () => import('./auth/pages/login.js');
const RegisterPage = () => import('./auth/pages/register.js');
const HomePage = () => import('./buyer/pages/home.js');
const ProductDetailPage = () => import('./buyer/pages/product-detail.js');
const SellerDashboard = () => import('./seller/pages/dashboard.js');
const CourierDashboard = () => import('./courier/pages/dashboard.js');
const AdminDashboard = () => import('./admin/pages/dashboard.js');
const NotFoundPage = () => import('./pages/not-found.js');

// ----- Register routes -----
function registerAllRoutes() {
  // Public
  registerRoute(ROUTE.HOME, null, HomePage);
  registerRoute(ROUTE.LOGIN, null, LoginPage);
  registerRoute(ROUTE.REGISTER, null, RegisterPage);
  registerRoute(ROUTE.PRODUCT_DETAIL, null, ProductDetailPage);

  // Seller (protected)
  registerRoute(ROUTE.SELLER_DASHBOARD, [ROLE.SELLER], SellerDashboard);

  // Courier (protected)
  registerRoute(ROUTE.COURIER_DASHBOARD, [ROLE.COURIER], CourierDashboard);

  // Admin (protected)
  registerRoute(ROUTE.ADMIN_DASHBOARD, [ROLE.ADMIN, ROLE.SUPER_ADMIN], AdminDashboard);

  // 404
  setNotFound(async () => {
    const mod = await NotFoundPage();
    return mod.default();
  });
}

// ----- Layout wrapper (header injection untuk non-dashboard pages) -----
setLayout((child, ctx) => {
  // Dashboard pages (seller/courier/admin) sudah punya layout sendiri
  const isDashboard = ctx.path.startsWith('/seller') || ctx.path.startsWith('/courier') || ctx.path.startsWith('/admin');
  if (isDashboard) return child;

  // Buyer & public pages: tidak ada global header (each page renders its own)
  return child;
});

// ----- Bootstrap -----
async function bootstrap() {
  // 1. Init Firebase Auth listener
  initAuth();

  // 2. Register routes
  registerAllRoutes();

  // 3. Update document title secara dinamis berdasarkan route
  updateTitleFromHash();
  window.addEventListener('hashchange', updateTitleFromHash);

  // 4. Auth change handler (optional: redirect login kalau route protected tapi belum login)
  onAuthChange(({ user, profile } = {}) => {
    // Update user menu / cart count di header — TODO saat header reactive
    // Untuk MVP, halaman akan re-render saat navigate.
  });

  // 5. Remove boot splash
  const splash = document.getElementById('boot-splash');
  if (splash) splash.remove();

  // 6. Start router
  startRouter();
}

function updateTitleFromHash() {
  const hash = (window.location.hash || '#/').slice(1);
  const titles = {
    '/': 'TokOnline — Marketplace Lokal 2026',
    '/login': 'Masuk — TokOnline',
    '/register': 'Daftar — TokOnline',
    '/seller': 'Dashboard Seller — TokOnline',
    '/courier': 'Dashboard Kurir — TokOnline',
    '/admin': 'Admin Panel — TokOnline',
  };
  let title = 'TokOnline';
  if (titles[hash]) title = titles[hash];
  else if (hash.startsWith('/produk/')) title = 'Detail Produk — TokOnline';
  else if (hash.startsWith('/search')) title = 'Cari Produk — TokOnline';
  else if (hash.startsWith('/cart')) title = 'Keranjang — TokOnline';
  document.title = title;
}

// ----- Start -----
bootstrap().catch((err) => {
  console.error('[app] bootstrap failed:', err);
  const app = document.getElementById('app');
  if (app) {
    app.replaceChildren(
      el('div', { className: 'empty-state' }, [
        el('div', { className: 'empty-state__icon', html: '⚠️' }),
        el('h2', { className: 'empty-state__title', text: 'Gagal memuat aplikasi' }),
        el('p', { className: 'empty-state__desc', text: 'Terjadi masalah. Coba muat ulang halaman.' }),
        el('button', { className: 'btn btn-primary', text: 'Muat Ulang', onClick: () => window.location.reload() }),
      ])
    );
  }
});
