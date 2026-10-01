// ============================================
// TokoWarung — Admin Ads Approval (Phase 5.5)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listPendingCampaigns, approveCampaign, rejectCampaign } from '../../services/adsService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';

const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', href: '#/admin', icon: '📊' },
  { id: 'orders', label: 'Orders', href: '#/admin/orders', icon: '📦' },
  { id: 'users', label: 'Users', href: '#/admin/users', icon: '👥' },
  { id: 'moderation', label: 'Moderation', href: '#/admin/products', icon: '🛡️' },
  { id: 'reports', label: 'Reports', href: '#/admin/reports', icon: '🚨' },
  { id: 'disputes', label: 'Disputes', href: '#/admin/disputes', icon: '⚖️' },
  { id: 'incidents', label: 'Incidents', href: '#/admin/incidents', icon: '⚠️' },
  { id: 'ads', label: 'Ads', href: '#/admin/ads', icon: '📢' },
  { id: 'finance', label: 'Finance', href: '#/admin/finance', icon: '💰' },
  { id: 'audit', label: 'Audit Logs', href: '#/admin/audit', icon: '📜' },
  { id: 'settings', label: 'Settings', href: '#/admin/settings', icon: '⚙️' },
];

export default async function AdminAdsPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/ads');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'ads' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Ads Approval Queue' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadCampaigns(content, user.uid);

  return page;
}

async function loadCampaigns(container, adminId) {
  try {
    const { items } = await listPendingCampaigns({ pageSize: 30 });

    container.replaceChildren();

    if (items.length === 0) {
      container.appendChild(EmptyState({ icon: '✅', title: 'Tidak ada campaign pending', desc: 'Semua campaign sudah diproses.' }));
      return;
    }

    items.forEach((c) => container.appendChild(renderCampaignCard(c, adminId, container)));
  } catch (err) {
    console.error('[admin ads] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat', desc: err.message }));
  }
}

function renderCampaignCard(c, adminId, container) {
  return el('div', { className: 'card mb-4' }, [
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'fw-700', text: c.campaignName }),
        el('p', { className: 'text-xs text-muted', text: `Seller: ${c.sellerId?.slice(0, 12)}... • Product: ${c.productId?.slice(0, 12)}...` }),
        el('p', { className: 'text-xs text-muted', text: formatDate(c.createdAt) }),
      ]),
      el('span', { className: 'badge badge-info', text: c.status.replace(/_/g, ' ') }),
    ]),
    el('div', { className: 'row gap-6 mb-3' }, [
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Budget' }), el('p', { className: 'fw-600', text: formatRupiah(c.budget) })]),
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Bid/Impression' }), el('p', { className: 'fw-600', text: formatRupiah(c.bidPerImpression) })]),
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Periode' }), el('p', { className: 'fw-600', text: `${formatDate(c.startDate?.toDate ? c.startDate.toDate() : c.startDate)} → ${formatDate(c.endDate?.toDate ? c.endDate.toDate() : c.endDate)}` })]),
    ]),
    c.targetLocation
      ? el('p', { className: 'text-xs text-muted', text: `Target: lat ${c.targetLocation.lat}, lng ${c.targetLocation.lng}, radius ${c.targetLocation.radiusKm || 10}km` })
      : null,
    el('div', { className: 'row gap-2 mt-3' }, [
      el('button', {
        className: 'btn btn-success btn-sm',
        text: '✓ Approve',
        onClick: async () => {
          try {
            await approveCampaign(c.id, adminId);
            toast.success('Campaign approved & active.');
            loadCampaigns(container, adminId);
          } catch (err) { toast.error(err.message); }
        },
      }),
      el('button', {
        className: 'btn btn-danger btn-sm',
        text: '✕ Reject',
        onClick: async () => {
          const reason = prompt('Alasan reject:', 'Campaign tidak sesuai kebijakan');
          if (reason === null) return;
          try {
            await rejectCampaign(c.id, adminId, reason);
            toast.success('Campaign rejected.');
            loadCampaigns(container, adminId);
          } catch (err) { toast.error(err.message); }
        },
      }),
    ]),
  ]);
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
