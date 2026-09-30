// ============================================
// TokoWarung — App Entry Point
// Bootstrap: init Firebase, Auth, Router, layout, dsb.
// ============================================

import { initAuth, onAuthChange } from './auth/authService.js';
import { isFirebaseConfigured } from './firebase/config.js';
import { startRouter, registerRoute, setNotFound, setLayout } from './router/router.js';
import { ROUTE, ROLE } from './utils/constants.js';
import { el } from './components/ui.js';

// ----- Pages (lazy-loaded utk code splitting) -----
const LoginPage = () => import('./auth/pages/login.js');
const RegisterPage = () => import('./auth/pages/register.js');
const HomePage = () => import('./buyer/pages/home.js');
const ProductDetailPage = () => import('./buyer/pages/product-detail.js');
const CartPage = () => import('./buyer/pages/cart.js');
const CheckoutPage = () => import('./buyer/pages/checkout.js');
const OrderSuccessPage = () => import('./buyer/pages/order-success.js');
const BuyerOrdersPage = () => import('./buyer/pages/orders.js');
const BuyerOrderDetailPage = () => import('./buyer/pages/order-detail.js');
const ProfilePage = () => import('./buyer/pages/profile.js');
const SellerDashboard = () => import('./seller/pages/dashboard.js');
const SellerOrdersPage = () => import('./seller/pages/orders.js');
const SellerOrderDetailPage = () => import('./seller/pages/order-detail.js');
const CourierDashboard = () => import('./courier/pages/dashboard.js');
const CourierOrdersPage = () => import('./courier/pages/orders.js');
const CourierOrderDetailPage = () => import('./courier/pages/order-detail.js');
const AdminDashboard = () => import('./admin/pages/dashboard.js');
const NotFoundPage = () => import('./pages/not-found.js');

// ----- Register routes -----
function registerAllRoutes() {
  // Public
  registerRoute(ROUTE.HOME, null, HomePage);
  registerRoute(ROUTE.LOGIN, null, LoginPage);
  registerRoute(ROUTE.REGISTER, null, RegisterPage);
  registerRoute(ROUTE.PRODUCT_DETAIL, null, ProductDetailPage);

  // Buyer (login optional — pages handle their own guards)
  registerRoute(ROUTE.BUYER_CART, null, CartPage);
  registerRoute(ROUTE.BUYER_CHECKOUT, null, CheckoutPage);
  registerRoute(ROUTE.BUYER_CHECKOUT_SUCCESS, null, OrderSuccessPage);
  registerRoute(ROUTE.BUYER_ORDERS, null, BuyerOrdersPage);
  registerRoute(ROUTE.BUYER_ORDER_DETAIL, null, BuyerOrderDetailPage);
  registerRoute(ROUTE.BUYER_PROFILE, null, ProfilePage);

  // Seller (protected)
  registerRoute(ROUTE.SELLER_DASHBOARD, [ROLE.SELLER], SellerDashboard);
  registerRoute(ROUTE.SELLER_ORDERS, [ROLE.SELLER], SellerOrdersPage);
  registerRoute(ROUTE.SELLER_ORDER_DETAIL, [ROLE.SELLER], SellerOrderDetailPage);

  // Courier (protected)
  registerRoute(ROUTE.COURIER_DASHBOARD, [ROLE.COURIER], CourierDashboard);
  registerRoute(ROUTE.COURIER_ORDERS, [ROLE.COURIER], CourierOrdersPage);
  registerRoute(ROUTE.COURIER_ORDER_DETAIL, [ROLE.COURIER], CourierOrderDetailPage);

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
  // 1. Init Firebase Auth listener (ini juga trigger Firebase init)
  initAuth();

  // 1.5 Cek apakah Firebase sudah dikonfigurasi dengan benar (env vars di Vercel)
  // Jika belum, tampilkan banner warning di atas app (tapi tetap lanjut router)
  showConfigWarningIfNeeded();

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
    '/': 'TokoWarung — Marketplace Lokal 2026',
    '/login': 'Masuk — TokoWarung',
    '/register': 'Daftar — TokoWarung',
    '/seller': 'Dashboard Seller — TokoWarung',
    '/courier': 'Dashboard Kurir — TokoWarung',
    '/admin': 'Admin Panel — TokoWarung',
  };
  let title = 'TokoWarung';
  if (titles[hash]) title = titles[hash];
  else if (hash.startsWith('/produk/')) title = 'Detail Produk — TokoWarung';
  else if (hash.startsWith('/search')) title = 'Cari Produk — TokoWarung';
  else if (hash.startsWith('/cart')) title = 'Keranjang — TokoWarung';
  document.title = title;
}

// ----- Show config warning banner if Firebase env vars not set -----
function showConfigWarningIfNeeded() {
  if (isFirebaseConfigured()) return;

  const banner = el('div', {
    className: 'config-warning-banner',
    attrs: { role: 'alert' },
  }, [
    el('div', { className: 'config-warning-banner__content' }, [
      el('span', { className: 'config-warning-banner__icon', html: '⚠️' }),
      el('div', { className: 'config-warning-banner__text' }, [
        el('strong', { text: 'Firebase belum dikonfigurasi.' }),
        el('span', {
          text: ' Login & register tidak akan berfungsi. Admin perlu set Environment Variables di Vercel.',
        }),
      ]),
    ]),
    el('button', {
      className: 'config-warning-banner__close',
      attrs: { 'aria-label': 'Tutup warning' },
      html: '✕',
      onClick: () => banner.remove(),
    }),
  ]);

  // Insert at top of body, before #app
  document.body.insertBefore(banner, document.body.firstChild);
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
