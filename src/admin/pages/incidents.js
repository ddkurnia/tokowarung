// ============================================
// TokoWarung — Admin Incidents Page (Phase 4)
// List incidents, investigate, resolve.
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listIncidents, assignIncident, resolveIncident, getIncidentStats } from '../../services/incidentService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
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

const STATUS_COLOR = {
  OPEN: 'warning',
  INVESTIGATING: 'info',
  RESOLVED: 'success',
  CLOSED: 'info',
};

export default async function AdminIncidentsPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/incidents');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'incidents' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Incident Management' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadIncidents(content, user.uid);

  return page;
}

async function loadIncidents(container, adminId) {
  try {
    const [incidents, stats] = await Promise.all([
      listIncidents({ pageSize: 30 }),
      getIncidentStats(),
    ]);

    container.replaceChildren();

    // Stats
    container.appendChild(
      el('div', { className: 'stats-grid mb-6' }, [
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Total Incidents' }),
          el('p', { className: 'stat-card__value', text: String(stats.total) }),
        ]),
        el('div', { className: 'stat-card stat-card--danger' }, [
          el('p', { className: 'stat-card__label', text: '🔴 Open' }),
          el('p', { className: 'stat-card__value', text: String(stats.open) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Investigating' }),
          el('p', { className: 'stat-card__value', text: String(stats.investigating) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Fraud Reports' }),
          el('p', { className: 'stat-card__value', text: String(stats.fraudReported) }),
        ]),
      ])
    );

    if (incidents.items.length === 0) {
      container.appendChild(EmptyState({ icon: '✅', title: 'Tidak ada incident', desc: 'Semua incident sudah resolved.' }));
      return;
    }

    incidents.items.forEach((inc) => container.appendChild(renderIncidentCard(inc, adminId, container)));
  } catch (err) {
    console.error('[admin incidents] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat incidents', desc: err.message }));
  }
}

function renderIncidentCard(inc, adminId, container) {
  const statusColor = STATUS_COLOR[inc.status] || 'info';
  const card = el('div', { className: 'card mb-4' });

  card.appendChild(
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: inc.type.replace(/_/g, ' ') }),
        el('p', { className: 'text-xs text-muted', text: formatDate(inc.createdAt) }),
        inc.reporterId ? el('p', { className: 'text-xs text-muted', text: `Reporter: ${inc.reporterId.slice(0, 12)}...` }) : null,
      ]),
      el('span', { className: 'badge badge-' + statusColor, text: inc.status }),
    ])
  );

  if (inc.description) card.appendChild(el('p', { className: 'text-sm mt-2', text: inc.description }));

  // Related entities
  const related = [];
  if (inc.orderId) related.push('Order: ' + inc.orderId.slice(-8).toUpperCase());
  if (inc.sellerId) related.push('Seller: ' + inc.sellerId.slice(0, 8));
  if (inc.courierId) related.push('Courier: ' + inc.courierId.slice(0, 8));
  if (inc.buyerId) related.push('Buyer: ' + inc.buyerId.slice(0, 8));
  if (related.length > 0) card.appendChild(el('p', { className: 'text-xs text-muted mt-2', text: related.join(' • ') }));

  // Evidence
  if (inc.evidence && inc.evidence.length > 0) {
    card.appendChild(
      el('div', { className: 'row gap-2 mt-3' }, inc.evidence.slice(0, 3).map((ev) =>
        el('img', { attrs: { src: ev.publicId ? getImageUrl(ev.publicId, { width: 100, height: 100, crop: 'fill', quality: 'auto:low' }) : ev.url, alt: 'evidence', loading: 'lazy' }, style: { width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px' } })
      ))
    );
  }

  // Actions
  const actions = el('div', { className: 'row gap-2 mt-3' });

  if (inc.status === 'OPEN') {
    actions.appendChild(el('button', {
      className: 'btn btn-secondary btn-sm',
      text: '🔍 Investigate',
      onClick: async () => {
        try {
          await assignIncident(inc.id, adminId);
          toast.success('Incident di-assign ke kamu untuk investigation.');
          loadIncidents(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
  }

  if (inc.status === 'OPEN' || inc.status === 'INVESTIGATING') {
    actions.appendChild(el('button', {
      className: 'btn btn-success btn-sm',
      text: '✓ Confirmed',
      onClick: async () => {
        const note = prompt('Catatan resolution:', 'Incident confirmed, action taken');
        try {
          await resolveIncident(inc.id, adminId, 'CONFIRMED', note || '');
          toast.success('Incident confirmed.');
          loadIncidents(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-secondary btn-sm',
      text: 'False Alarm',
      onClick: async () => {
        try {
          await resolveIncident(inc.id, adminId, 'FALSE_ALARM', 'False alarm, no action needed');
          toast.success('Marked as false alarm.');
          loadIncidents(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-danger btn-sm',
      text: '⚠️ Escalate',
      onClick: async () => {
        try {
          await resolveIncident(inc.id, adminId, 'ESCALATED', 'Escalated to manual review');
          toast.info('Incident escalated.');
          loadIncidents(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
  }

  if (actions.children.length > 0) card.appendChild(actions);
  return card;
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
