// ============================================
// TokOnline — Seller Dashboard
// ============================================

import { el, EmptyState, Spinner } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { navigate } from '../../router/router.js';
import { getSellerProfile, listSellerProducts } from '../../services/sellerDashboardService.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah } from '../../utils/helpers.js';

export default async function SellerDashboard({ user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller');
    return el('div');
  }

  const page = el('div', { className: 'dashboard' });

  // Sidebar nav
  page.appendChild(renderSidebar('dashboard'));

  // Main content
  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  // Top bar
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Dashboard' }),
      el('div', { className: 'row gap-2' }, [
        el('button', { className: 'btn btn-secondary btn-sm', text: 'Lihat Toko', onClick: () => navigate('/toko/' + user.uid) }),
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  // Loading state
  const content = el('div', { className: 'dashboard__content' });
  main.appendChild(content);
  content.appendChild(el('div', { className: 'page-skeleton' }));

  // Async load dashboard data
  loadDashboard(content, user.uid, profile);

  return page;
}

async function loadDashboard(container, uid, profile) {
  try {
    const seller = await getSellerProfile(uid).catch(() => null);

    // Verification banner kalau belum verified
    if (seller && seller.verificationStatus !== 'VERIFIED') {
      container.replaceChildren(
        el('div', { className: 'banner banner-warning' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: 'Toko belum terverifikasi' }),
            el('p', { className: 'banner__desc', text: 'Lengkapi data & dokumen toko untuk mulai berjualan.' }),
          ]),
          el('button', { className: 'btn btn-primary btn-sm', text: 'Verifikasi sekarang', onClick: () => navigate('/seller/settings') }),
        ])
      );
      return;
    }

    // Stats
    const stats = [
      { label: 'Omzet Hari Ini', value: formatRupiah(seller?.todayRevenue || 0), color: 'primary' },
      { label: 'Omzet Bulan Ini', value: formatRupiah(seller?.monthRevenue || 0), color: 'success' },
      { label: 'Pesanan Baru', value: String(seller?.newOrders || 0), color: 'info' },
      { label: 'Saldo Tersedia', value: formatRupiah(seller?.wallet?.available || 0), color: 'success' },
      { label: 'Saldo Tertunda', value: formatRupiah(seller?.wallet?.pending || 0), color: 'warning' },
      { label: 'Rating Toko', value: (seller?.rating || 0).toFixed(1) + ' ⭐', color: 'primary' },
    ];

    container.replaceChildren();
    container.appendChild(
      el('div', { className: 'stats-grid' }, stats.map((s) =>
        el('div', { className: 'stat-card stat-card--' + s.color }, [
          el('p', { className: 'stat-card__label', text: s.label }),
          el('p', { className: 'stat-card__value', text: s.value }),
        ])
      ))
    );

    // Quick actions
    container.appendChild(
      el('div', { className: 'quick-actions' }, [
        el('button', { className: 'btn btn-primary', text: '+ Tambah Produk', onClick: () => navigate('/seller/products/new') }),
        el('button', { className: 'btn btn-secondary', text: 'Lihat Pesanan', onClick: () => navigate('/seller/orders') }),
        el('button', { className: 'btn btn-secondary', text: 'Atur Promo', onClick: () => navigate('/seller/promos') }),
      ])
    );

    // Recent orders placeholder
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('div', { className: 'row-between mb-4' }, [
          el('h2', { text: 'Pesanan Terbaru' }),
          el('button', { className: 'btn-link', text: 'Lihat semua', onClick: () => navigate('/seller/orders') }),
        ]),
        EmptyState({ icon: '📦', title: 'Belum ada pesanan', desc: 'Pesanan masuk akan muncul di sini.' }),
      ])
    );

    // Recent products
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('div', { className: 'row-between mb-4' }, [
          el('h2', { text: 'Produk Toko' }),
          el('button', { className: 'btn-link', text: 'Kelola produk', onClick: () => navigate('/seller/products') }),
        ]),
        el('div', { id: 'recentProducts', className: 'skeleton skeleton-block' }),
      ])
    );

    // Load recent products
    loadRecentProducts(container.querySelector('#recentProducts'), uid);
  } catch (err) {
    console.error('[seller] Gagal load dashboard:', err);
    container.replaceChildren(
      EmptyState({ icon: '⚠️', title: 'Gagal memuat dashboard', desc: 'Coba muat ulang halaman.' })
    );
  }
}

async function loadRecentProducts(container, sellerId) {
  try {
    const { items } = await listSellerProducts(sellerId, { pageSize: 5 });
    if (items.length === 0) {
      container.replaceChildren(EmptyState({ icon: '📦', title: 'Belum ada produk', desc: 'Tambahkan produk pertamamu.' }));
      return;
    }
    const list = el('div', { className: 'product-list-mini' });
    items.forEach((p) => {
      list.appendChild(
        el('a', { className: 'product-row', href: '#/seller/products/' + p.id }, [
          el('div', { className: 'product-row__img' }, p.images?.[0] ? el('img', { attrs: { src: p.images[0], alt: p.name, loading: 'lazy' } }) : el('span', { html: '🖼️' })),
          el('div', { className: 'product-row__content' }, [
            el('h3', { className: 'product-row__name', text: p.name }),
            el('div', { className: 'row gap-2' }, [
              el('span', { className: 'text-sm fw-600', text: formatRupiah(p.price) }),
              el('span', { className: 'badge badge-' + (p.status === 'APPROVED' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'info'), text: p.status }),
            ]),
          ]),
        ])
      );
    });
    container.replaceChildren(list);
  } catch (err) {
    console.error('[seller] Gagal load products:', err);
  }
}

// ----- Sidebar -----
function renderSidebar(active) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', href: '#/seller', icon: '📊' },
    { id: 'products', label: 'Produk', href: '#/seller/products', icon: '📦' },
    { id: 'orders', label: 'Pesanan', href: '#/seller/orders', icon: '📋' },
    { id: 'finance', label: 'Keuangan', href: '#/seller/finance', icon: '💰' },
    { id: 'promos', label: 'Promosi', href: '#/seller/promos', icon: '🎯' },
    { id: 'settings', label: 'Pengaturan Toko', href: '#/seller/settings', icon: '⚙️' },
  ];
  const nav = el('aside', { className: 'dashboard__sidebar' });
  nav.appendChild(el('div', { className: 'dashboard__brand', html: 'TOK<span>Online</span> Seller' }));
  items.forEach((it) => {
    nav.appendChild(
      el('a', {
        className: 'nav-item' + (it.id === active ? ' is-active' : ''),
        href: it.href,
      }, [
        el('span', { className: 'nav-item__icon', html: it.icon }),
        el('span', { className: 'nav-item__label', text: it.label }),
      ])
    );
  });
  return nav;
}

async function handleLogout() {
  try {
    await logout();
    toast.success('Berhasil keluar.');
    navigate('/login');
  } catch (err) {
    toast.error('Gagal keluar. Coba lagi.');
  }
}
