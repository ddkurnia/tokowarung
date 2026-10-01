// ============================================
// TokoWarung — Admin Dashboard
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatCompact } from '../../utils/helpers.js';

const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', href: '#/admin', icon: '📊' },
  { id: 'analytics', label: 'Analytics', href: '#/admin/analytics', icon: '📈' },
  { id: 'orders', label: 'Orders', href: '#/admin/orders', icon: '📦' },
  { id: 'users', label: 'Users', href: '#/admin/users', icon: '👥' },
  { id: 'products', label: 'Products (Moderation)', href: '#/admin/products', icon: '🛡️' },
  { id: 'sellers', label: 'Sellers', href: '#/admin/sellers', icon: '🏪' },
  { id: 'couriers', label: 'Couriers', href: '#/admin/couriers', icon: '🛵' },
  { id: 'finance', label: 'Finance', href: '#/admin/finance', icon: '💰' },
  { id: 'reports', label: 'Reports', href: '#/admin/reports', icon: '🚨' },
  { id: 'disputes', label: 'Disputes', href: '#/admin/disputes', icon: '⚖️' },
  { id: 'incidents', label: 'Incidents', href: '#/admin/incidents', icon: '⚠️' },
  { id: 'fraud', label: 'Fraud', href: '#/admin/fraud', icon: '🔍' },
  { id: 'ads', label: 'Ads', href: '#/admin/ads', icon: '📢' },
  { id: 'audit', label: 'Audit Logs', href: '#/admin/audit', icon: '📜' },
  { id: 'settings', label: 'Settings', href: '#/admin/settings', icon: '⚙️' },
];

export default async function AdminDashboard({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  // Sidebar
  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(
      el('a', {
        className: 'nav-item' + (it.id === 'overview' ? ' is-active' : ''),
        href: it.href,
      }, [
        el('span', { className: 'nav-item__icon', html: it.icon }),
        el('span', { className: 'nav-item__label', text: it.label }),
      ])
    );
  });
  sidebar.appendChild(
    el('div', { className: 'admin-panel__sidebar-footer' }, [
      el('div', { className: 'admin-panel__user' }, [
        el('div', { className: 'avatar', text: (profile?.displayName || 'A').charAt(0).toUpperCase() }),
        el('div', {}, [
          el('p', { className: 'text-sm fw-600', text: profile?.displayName || 'Admin' }),
          el('p', { className: 'text-xs text-muted', text: profile?.role }),
        ]),
      ]),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );
  page.appendChild(sidebar);

  // Main
  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Overview' }),
      el('div', { className: 'row gap-2' }, [
        el('span', { className: 'badge badge-success', text: '● Sistem berjalan' }),
        el('button', { className: 'btn btn-secondary btn-sm', text: 'Export Laporan', onClick: () => toast.info('Fitur export akan tersedia segera.') }),
      ]),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  main.appendChild(content);
  page.appendChild(main);

  // Render overview
  renderOverview(content);

  return page;
}

function renderOverview(container) {
  // Stats
  const stats = [
    { label: 'Pengguna Aktif', value: '—', color: 'primary', icon: '👥' },
    { label: 'Total Seller', value: '—', color: 'success', icon: '🏪' },
    { label: 'Total Courier', value: '—', color: 'info', icon: '🛵' },
    { label: 'Order Hari Ini', value: '—', color: 'warning', icon: '📦' },
    { label: 'GMV Hari Ini', value: formatRupiah(0), color: 'success', icon: '💰' },
    { label: 'Moderation Queue', value: '—', color: 'danger', icon: '🛡️' },
  ];

  container.appendChild(
    el('div', { className: 'stats-grid' }, stats.map((s) =>
      el('div', { className: 'stat-card stat-card--' + s.color }, [
        el('div', { className: 'stat-card__icon', html: s.icon }),
        el('div', {}, [
          el('p', { className: 'stat-card__label', text: s.label }),
          el('p', { className: 'stat-card__value', text: s.value }),
        ]),
      ])
    ))
  );

  // Quick links
  container.appendChild(
    el('div', { className: 'card mt-6' }, [
      el('h2', { className: 'mb-4', text: 'Aksi Cepat' }),
      el('div', { className: 'quick-actions' }, [
        el('button', { className: 'btn btn-secondary', html: '🛡️ Review Produk', onClick: () => navigate('/admin/products') }),
        el('button', { className: 'btn btn-secondary', html: '🏪 Verifikasi Seller', onClick: () => navigate('/admin/sellers') }),
        el('button', { className: 'btn btn-secondary', html: '🛵 Verifikasi Kurir', onClick: () => navigate('/admin/couriers') }),
        el('button', { className: 'btn btn-secondary', html: '🚨 Lihat Laporan', onClick: () => navigate('/admin/reports') }),
      ]),
    ])
  );

  // Recent activity placeholder
  container.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('h2', { className: 'mb-4', text: 'Aktivitas Terbaru' }),
      EmptyState({ icon: '📊', title: 'Data akan muncul setelah ada aktivitas', desc: 'Audit log akan menampilkan tindakan admin & transaksi penting.' }),
    ])
  );
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
