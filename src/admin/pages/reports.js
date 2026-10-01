// ============================================
// TokoWarung — Admin Reports Page (Phase 4)
// List reports with priority filter, assign, resolve.
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, showModal, confirmDialog } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listReports, assignReport, resolveReport, getReportStats } from '../../services/reportService.js';
import { navigate } from '../../router/router.js';
import { ROLE, REPORT_PRIORITY } from '../../utils/constants.js';
import { formatDate } from '../../utils/helpers.js';
import { getImageUrl } from '../../services/storageService.js';

const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', href: '#/admin', icon: '📊' },
  { id: 'orders', label: 'Orders', href: '#/admin/orders', icon: '📦' },
  { id: 'users', label: 'Users', href: '#/admin/users', icon: '👥' },
  { id: 'moderation', label: 'Moderation', href: '#/admin/products', icon: '🛡️' },
  { id: 'reports', label: 'Reports', href: '#/admin/reports', icon: '🚨' },
  { id: 'disputes', label: 'Disputes', href: '#/admin/disputes', icon: '⚖️' },
  { id: 'incidents', label: 'Incidents', href: '#/admin/incidents', icon: '⚠️' },
  { id: 'finance', label: 'Finance', href: '#/admin/finance', icon: '💰' },
  { id: 'audit', label: 'Audit Logs', href: '#/admin/audit', icon: '📜' },
  { id: 'settings', label: 'Settings', href: '#/admin/settings', icon: '⚙️' },
];

const PRIORITY_COLOR = {
  LOW: 'info',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const STATUS_COLOR = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
  VERIFIED: 'success',
  DISMISSED: 'info',
  ESCALATED: 'danger',
};

export default async function AdminReportsPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/reports');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  // Sidebar
  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'reports' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Reports Queue' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadReports(content, user.uid);

  return page;
}

async function loadReports(container, adminId) {
  try {
    const [reports, stats] = await Promise.all([
      listReports({ pageSize: 30 }),
      getReportStats(),
    ]);

    container.replaceChildren();

    // Stats grid
    container.appendChild(
      el('div', { className: 'stats-grid mb-6' }, [
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Total Reports' }),
          el('p', { className: 'stat-card__value', text: String(stats.total) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Pending' }),
          el('p', { className: 'stat-card__value', text: String(stats.pending) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'In Review' }),
          el('p', { className: 'stat-card__value', text: String(stats.inReview) }),
        ]),
        el('div', { className: 'stat-card stat-card--danger' }, [
          el('p', { className: 'stat-card__label', text: '🔴 Urgent' }),
          el('p', { className: 'stat-card__value', text: String(stats.urgent) }),
        ]),
      ])
    );

    // List
    if (reports.items.length === 0) {
      container.appendChild(EmptyState({ icon: '✅', title: 'Tidak ada report', desc: 'Semua report sudah diproses.' }));
      return;
    }

    // Sort by priority (URGENT first)
    const sorted = [...reports.items].sort((a, b) => {
      const priorityRank = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
    });

    sorted.forEach((r) => container.appendChild(renderReportCard(r, adminId, container)));
  } catch (err) {
    console.error('[admin reports] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat reports', desc: err.message }));
  }
}

function renderReportCard(r, adminId, container) {
  const priorityColor = PRIORITY_COLOR[r.priority] || 'info';
  const statusColor = STATUS_COLOR[r.status] || 'info';

  const card = el('div', { className: 'card mb-4' });

  card.appendChild(
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: `${r.type} #${r.targetId?.slice(-8).toUpperCase() || ''}` }),
        el('p', { className: 'text-xs text-muted', text: formatDate(r.createdAt) }),
        el('p', { className: 'text-xs text-muted', text: `Reporter: ${r.reporterId?.slice(0, 12) || '...'}...` }),
      ]),
      el('div', { className: 'col gap-2' }, [
        el('span', { className: 'badge badge-' + priorityColor, text: r.priority }),
        el('span', { className: 'badge badge-' + statusColor, text: r.status }),
      ]),
    ])
  );

  card.appendChild(
    el('div', {}, [
      el('p', { className: 'fw-600', text: r.reason }),
      r.description ? el('p', { className: 'text-sm mt-2', text: r.description }) : null,
    ])
  );

  // Evidence
  if (r.evidence && r.evidence.length > 0) {
    card.appendChild(
      el('div', { className: 'row gap-2 mt-3' }, r.evidence.slice(0, 3).map((ev) =>
        el('img', {
          attrs: { src: ev.publicId ? getImageUrl(ev.publicId, { width: 100, height: 100, crop: 'fill', quality: 'auto:low' }) : ev.url, alt: 'evidence', loading: 'lazy' },
          style: { width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' },
        })
      ))
    );
  }

  // Actions
  const actions = el('div', { className: 'row gap-2 mt-3' });

  if (r.status === 'PENDING') {
    actions.appendChild(el('button', {
      className: 'btn btn-secondary btn-sm',
      text: '📌 Assign to me',
      onClick: async () => {
        try {
          await assignReport(r.id, adminId);
          toast.success('Report di-assign ke kamu.');
          loadReports(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
  }

  if (r.status === 'PENDING' || r.status === 'IN_REVIEW') {
    actions.appendChild(el('button', {
      className: 'btn btn-success btn-sm',
      text: '✓ Verified',
      onClick: async () => {
        const note = prompt('Catatan resolution (opsional):', 'Report terverifikasi, action diambil');
        try {
          await resolveReport(r.id, adminId, 'VERIFIED', note || '');
          toast.success('Report marked verified.');
          loadReports(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-secondary btn-sm',
      text: '✕ Dismiss',
      onClick: async () => {
        const note = prompt('Alasan dismiss:', 'Tidak ada cukup bukti');
        if (note === null) return;
        try {
          await resolveReport(r.id, adminId, 'DISMISSED', note);
          toast.success('Report di-dismiss.');
          loadReports(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-danger btn-sm',
      text: '⚠️ Escalate',
      onClick: async () => {
        try {
          await resolveReport(r.id, adminId, 'ESCALATED', 'Escalated to incident system');
          toast.info('Report escalated. Buat incident di /admin/incidents.');
          loadReports(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
  }

  if (actions.children.length > 0) card.appendChild(actions);
  return card;
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
