// ============================================
// TokoWarung — Admin Disputes Page (Phase 4)
// Dispute center: list tickets, see messages, resolve.
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listDisputes, getDispute, assignDispute, resolveDispute, addDisputeMessage } from '../../services/disputeService.js';
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
  IN_REVIEW: 'info',
  RESOLVED: 'success',
  CLOSED: 'info',
};

export default async function AdminDisputesPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/disputes');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'disputes' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Dispute Center' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadDisputes(content, user.uid);

  return page;
}

async function loadDisputes(container, adminId) {
  try {
    const { items } = await listDisputes({ pageSize: 30 });

    container.replaceChildren();

    if (items.length === 0) {
      container.appendChild(EmptyState({ icon: '⚖️', title: 'Tidak ada dispute', desc: 'Belum ada tiket dispute yang dibuka.' }));
      return;
    }

    items.forEach((d) => container.appendChild(renderDisputeCard(d, adminId, container)));
  } catch (err) {
    console.error('[admin disputes] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat disputes', desc: err.message }));
  }
}

function renderDisputeCard(d, adminId, container) {
  const statusColor = STATUS_COLOR[d.status] || 'info';

  const card = el('div', { className: 'card mb-4' });
  card.appendChild(
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: `${d.type} • Order #${d.orderId?.slice(-8).toUpperCase()}` }),
        el('p', { className: 'text-xs text-muted', text: formatDate(d.createdAt) }),
      ]),
      el('span', { className: 'badge badge-' + statusColor, text: d.status }),
    ])
  );

  card.appendChild(el('p', { className: 'fw-600', text: d.reason }));
  if (d.description) card.appendChild(el('p', { className: 'text-sm mt-2', text: d.description }));

  // Participants
  card.appendChild(el('p', { className: 'text-xs text-muted mt-2', text: `Participants: ${(d.participants || []).map((p) => p.slice(0, 8)).join(' vs ')}` }));

  // Messages count
  if (d.messages && d.messages.length > 0) {
    card.appendChild(el('p', { className: 'text-xs text-muted', text: `${d.messages.length} messages` }));
  }

  // Evidence
  if (d.evidence && d.evidence.length > 0) {
    card.appendChild(
      el('div', { className: 'row gap-2 mt-3' }, d.evidence.slice(0, 3).map((ev) =>
        el('img', { attrs: { src: ev.publicId ? getImageUrl(ev.publicId, { width: 100, height: 100, crop: 'fill', quality: 'auto:low' }) : ev.url, alt: 'evidence', loading: 'lazy' }, style: { width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px' } })
      ))
    );
  }

  // Actions
  const actions = el('div', { className: 'row gap-2 mt-3' });

  if (d.status === 'OPEN') {
    actions.appendChild(el('button', {
      className: 'btn btn-secondary btn-sm',
      text: '📌 Take Case',
      onClick: async () => {
        try {
          await assignDispute(d.id, adminId);
          toast.success('Dispute di-assign ke kamu.');
          loadDisputes(container, adminId);
        } catch (err) { toast.error(err.message); }
      },
    }));
  }

  if (d.status === 'OPEN' || d.status === 'IN_REVIEW') {
    actions.appendChild(el('button', {
      className: 'btn btn-primary btn-sm',
      text: '💬 Open & Reply',
      onClick: () => showDisputeModal(d, adminId, container),
    }));
  }

  card.appendChild(actions);
  return card;
}

function showDisputeModal(dispute, adminId, container) {
  let messageInput;
  const messagesContainer = el('div', { className: 'dispute-messages', style: { maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' } });

  // Render existing messages
  (dispute.messages || []).forEach((m) => {
    messagesContainer.appendChild(
      el('div', { className: 'dispute-message' }, [
        el('p', { className: 'text-xs text-muted', text: m.senderId === adminId ? 'Admin' : 'User ' + m.senderId.slice(0, 8) }),
        el('p', { className: 'text-sm', text: m.text }),
        el('p', { className: 'text-xs text-muted', text: formatDate(m.at) }),
      ])
    );
  });

  showModal({
    title: `Dispute: ${dispute.type}`,
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: `Reason: ${dispute.reason}` }),
      dispute.description ? el('p', { className: 'text-sm mb-4', text: dispute.description }) : null,
      messagesContainer,
      el('div', { className: 'field' }, [
        el('label', { className: 'field-label', text: 'Reply (as admin)' }),
        messageInput = el('textarea', { className: 'textarea', attrs: { placeholder: 'Tulis pesan...', rows: '3' } }),
      ]),
    ]),
    actions: [
      { label: 'Tutup', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Send Message',
        variant: 'primary',
        onClick: async (c) => {
          const text = messageInput.value.trim();
          if (!text) return toast.error('Tulis pesan dulu.');
          try {
            await addDisputeMessage(dispute.id, adminId, text);
            toast.success('Pesan terkirim.');
            c();
            loadDisputes(container, adminId);
          } catch (err) { toast.error(err.message); }
        },
      },
      {
        label: 'Resolve Dispute',
        variant: 'success',
        onClick: async (c) => {
          const resolution = prompt('Resolution (BUYER_FAVORED / SELLER_FAVORED / COURIER_FAVORED / COMPROMISE / DISMISSED):', 'COMPROMISE');
          if (!resolution) return;
          const note = prompt('Catatan:', 'Dispute resolved by admin');
          try {
            await resolveDispute(dispute.id, adminId, resolution.toUpperCase(), note || '');
            toast.success('Dispute resolved.');
            c();
            loadDisputes(container, adminId);
          } catch (err) { toast.error(err.message); }
        },
      },
    ],
  });
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
