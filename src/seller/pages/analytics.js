// ============================================
// TokoWarung — Seller Analytics Page (Phase 6)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { getSellerAnalytics, getSellerRevenueTrend } from '../../services/analyticsService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatCompact, formatDate } from '../../utils/helpers.js';
import { getImageUrl } from '../../services/storageService.js';

export default async function SellerAnalyticsPage({ user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller/analytics');
    return el('div');
  }

  const page = el('div', { className: 'dashboard' });
  page.appendChild(renderSidebar());

  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Analytics' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'dashboard__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadAnalytics(content, user.uid);

  return page;
}

async function loadAnalytics(container, sellerId) {
  try {
    const [analytics, trend] = await Promise.all([
      getSellerAnalytics(sellerId),
      getSellerRevenueTrend(sellerId, 14),
    ]);

    if (!analytics) {
      container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat analytics' }));
      return;
    }

    container.replaceChildren();

    // Top stats
    container.appendChild(
      el('div', { className: 'stats-grid' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'Total Revenue' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(analytics.totalRevenue) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Total Orders' }),
          el('p', { className: 'stat-card__value', text: String(analytics.totalOrders) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Today Revenue' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(analytics.todayRevenue) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Avg Order Value' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(analytics.avgOrderValue) }),
        ]),
      ])
    );

    // Secondary stats
    container.appendChild(
      el('div', { className: 'stats-grid mt-4' }, [
        el('div', { className: 'stat-card' }, [
          el('p', { className: 'stat-card__label', text: 'Active Products' }),
          el('p', { className: 'stat-card__value', text: String(analytics.activeProducts) }),
        ]),
        el('div', { className: 'stat-card' }, [
          el('p', { className: 'stat-card__label', text: 'Pending Orders' }),
          el('p', { className: 'stat-card__value', text: String(analytics.pendingOrders) }),
        ]),
        el('div', { className: 'stat-card' }, [
          el('p', { className: 'stat-card__label', text: 'Completed' }),
          el('p', { className: 'stat-card__value', text: String(analytics.completedOrders) }),
        ]),
        el('div', { className: 'stat-card stat-card--danger' }, [
          el('p', { className: 'stat-card__label', text: 'Low Stock' }),
          el('p', { className: 'stat-card__value', text: String(analytics.lowStockCount) }),
        ]),
      ])
    );

    // Revenue chart
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '📈 Revenue Trend (14 days)' }),
        el('div', { className: 'chart-container' }, trend.map((day) => {
          const maxRev = Math.max(...trend.map((d) => d.revenue), 1);
          const heightPct = (day.revenue / maxRev) * 100;
          return el('div', { className: 'chart-bar' }, [
            el('div', { className: 'chart-bar__bar chart-bar__bar--success', style: { height: Math.max(heightPct, 2) + '%' }, attrs: { title: `${formatRupiah(day.revenue)} • ${day.orders} orders` } }),
            el('div', { className: 'chart-bar__label', text: day.date.slice(5) }),
          ]);
        })),
      ])
    );

    // Top products
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '🔥 Top Products (by soldCount)' }),
        analytics.topProducts.length === 0
          ? EmptyState({ icon: '📦', title: 'Belum ada produk terjual' })
          : el('div', { className: 'product-list-mini' }, analytics.topProducts.map((p) =>
              el('div', { className: 'product-row' }, [
                el('div', { className: 'product-row__img' }, p.images?.[0]?.publicId
                  ? el('img', { attrs: { src: getImageUrl(p.images[0].publicId, { width: 96, height: 96, crop: 'fill', quality: 'auto' }), alt: p.name, loading: 'lazy' } })
                  : el('span', { html: '🖼️' })),
                el('div', { className: 'product-row__content' }, [
                  el('h3', { className: 'product-row__name', text: p.name }),
                  el('p', { className: 'text-xs text-muted', text: formatRupiah(p.price) }),
                ]),
                el('div', { className: 'text-right' }, [
                  el('p', { className: 'fw-700', text: String(p.soldCount || 0) }),
                  el('p', { className: 'text-xs text-muted', text: 'terjual' }),
                ]),
              ])
            )),
      ])
    );

    // Low stock alert
    if (analytics.lowStockProducts.length > 0) {
      container.appendChild(
        el('div', { className: 'banner banner-warning mt-6' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: `⚠️ ${analytics.lowStockProducts.length} Produk Stok Rendah` }),
            el('p', { className: 'banner__desc', text: analytics.lowStockProducts.map((p) => p.name).join(', ') }),
          ]),
        ])
      );
    }
  } catch (err) {
    console.error('[seller analytics] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat analytics', desc: err.message }));
  }
}

function renderSidebar() {
  const items = [
    { id: 'dashboard', label: 'Dashboard', href: '#/seller', icon: '📊' },
    { id: 'analytics', label: 'Analytics', href: '#/seller/analytics', icon: '📈' },
    { id: 'products', label: 'Produk', href: '#/seller/products', icon: '📦' },
    { id: 'orders', label: 'Pesanan', href: '#/seller/orders', icon: '📋' },
    { id: 'finance', label: 'Keuangan', href: '#/seller/finance', icon: '💰' },
    { id: 'vouchers', label: 'Voucher', href: '#/seller/vouchers', icon: '🎟️' },
    { id: 'ads', label: 'Iklan', href: '#/seller/ads', icon: '📢' },
    { id: 'pos', label: 'POS Offline', href: '#/seller/pos', icon: '🛒' },
    { id: 'settings', label: 'Pengaturan Toko', href: '#/seller/settings', icon: '⚙️' },
  ];
  const nav = el('aside', { className: 'dashboard__sidebar' });
  nav.appendChild(el('div', { className: 'dashboard__brand', html: 'Toko<span>Warung</span> Seller' }));
  items.forEach((it) => {
    nav.appendChild(el('a', { className: 'nav-item' + (it.id === 'analytics' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  return nav;
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
