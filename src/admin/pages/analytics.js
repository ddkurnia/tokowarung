// ============================================
// TokoWarung — Admin Analytics Dashboard (Phase 6)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { getPlatformOverview, getTopSellers, getTopProducts, getOrderGrowth } from '../../services/analyticsService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatCompact, formatDate } from '../../utils/helpers.js';
import { getImageUrl } from '../../services/storageService.js';

const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', href: '#/admin', icon: '📊' },
  { id: 'analytics', label: 'Analytics', href: '#/admin/analytics', icon: '📈' },
  { id: 'orders', label: 'Orders', href: '#/admin/orders', icon: '📦' },
  { id: 'users', label: 'Users', href: '#/admin/users', icon: '👥' },
  { id: 'moderation', label: 'Moderation', href: '#/admin/products', icon: '🛡️' },
  { id: 'reports', label: 'Reports', href: '#/admin/reports', icon: '🚨' },
  { id: 'disputes', label: 'Disputes', href: '#/admin/disputes', icon: '⚖️' },
  { id: 'incidents', label: 'Incidents', href: '#/admin/incidents', icon: '⚠️' },
  { id: 'fraud', label: 'Fraud', href: '#/admin/fraud', icon: '🔍' },
  { id: 'ads', label: 'Ads', href: '#/admin/ads', icon: '📢' },
  { id: 'finance', label: 'Finance', href: '#/admin/finance', icon: '💰' },
  { id: 'audit', label: 'Audit Logs', href: '#/admin/audit', icon: '📜' },
  { id: 'settings', label: 'Settings', href: '#/admin/settings', icon: '⚙️' },
];

export default async function AdminAnalyticsPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/analytics');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'analytics' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Platform Analytics' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadAnalytics(content);

  return page;
}

async function loadAnalytics(container) {
  try {
    const [overview, topSellers, topProducts, orderGrowth] = await Promise.all([
      getPlatformOverview(),
      getTopSellers(5),
      getTopProducts(5),
      getOrderGrowth(14), // last 14 days for chart
    ]);

    container.replaceChildren();

    // Overview stats
    container.appendChild(
      el('div', { className: 'stats-grid' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'GMV Total' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(overview.gmv) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Total Users' }),
          el('p', { className: 'stat-card__value', text: formatCompact(overview.totalUsers) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Total Orders' }),
          el('p', { className: 'stat-card__value', text: formatCompact(overview.totalOrders) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Today GMV' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(overview.todayGMV) }),
        ]),
      ])
    );

    // Secondary stats
    container.appendChild(
      el('div', { className: 'stats-grid mt-4' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'Sellers' }),
          el('p', { className: 'stat-card__value', text: String(overview.totalSellers) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Couriers' }),
          el('p', { className: 'stat-card__value', text: String(overview.totalCouriers) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Products' }),
          el('p', { className: 'stat-card__value', text: String(overview.totalProducts) }),
        ]),
        el('div', { className: 'stat-card stat-card--danger' }, [
          el('p', { className: 'stat-card__label', text: 'Cancelled' }),
          el('p', { className: 'stat-card__value', text: String(overview.cancelledOrders) }),
        ]),
      ])
    );

    // Order growth chart (bar chart)
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '📈 Order Growth (Last 14 Days)' }),
        el('div', { className: 'chart-container' }, orderGrowth.map((day) => {
          const maxCount = Math.max(...orderGrowth.map((d) => d.count), 1);
          const heightPct = (day.count / maxCount) * 100;
          return el('div', { className: 'chart-bar' }, [
            el('div', { className: 'chart-bar__bar', style: { height: Math.max(heightPct, 2) + '%' }, attrs: { title: `${day.count} orders • ${formatRupiah(day.gmv)}` } }),
            el('div', { className: 'chart-bar__label', text: day.date.slice(5) }),
          ]);
        })),
      ])
    );

    // Top sellers
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '🏆 Top Sellers (by GMV)' }),
        topSellers.length === 0
          ? EmptyState({ icon: '🏪', title: 'Belum ada data' })
          : el('div', { className: 'data-table-wrap' }, [
              el('table', { className: 'data-table' }, [
                el('thead', {}, [el('tr', {}, [
                  el('th', { text: 'Seller' }),
                  el('th', { text: 'Orders' }),
                  el('th', { text: 'GMV' }),
                ])]),
                el('tbody', {}, topSellers.map((s) => el('tr', {}, [
                  el('td', { text: s.sellerName || s.sellerId.slice(0, 12) + '...' }),
                  el('td', { text: String(s.orderCount) }),
                  el('td', { className: 'fw-600 text-success', text: formatRupiah(s.totalGMV) }),
                ]))),
              ]),
            ]),
      ])
    );

    // Top products
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '🔥 Top Products (by soldCount)' }),
        topProducts.length === 0
          ? EmptyState({ icon: '📦', title: 'Belum ada data' })
          : el('div', { className: 'product-list-mini' }, topProducts.map((p) =>
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
  } catch (err) {
    console.error('[admin analytics] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat analytics', desc: err.message }));
  }
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
