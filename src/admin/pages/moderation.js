// ============================================
// TokoWarung — Admin Moderation Queue (Phase 4)
// Review pending products (PENDING_REVIEW) + auto-flagged (SUSPENDED)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listPendingReviewProducts, listAutoFlaggedProducts, approveProduct, rejectProduct, suspendProduct } from '../../services/productService.js';
import { addViolation } from '../../services/violationService.js';
import { navigate } from '../../router/router.js';
import { ROLE, PRODUCT_STATUS } from '../../utils/constants.js';
import { formatRupiah, formatDate, truncate } from '../../utils/helpers.js';
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

export default async function AdminModerationPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/products');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  // Sidebar
  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'moderation' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Moderation Queue' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadQueue(content, user.uid);

  return page;
}

async function loadQueue(container, adminId) {
  try {
    const [pending, flagged] = await Promise.all([
      listPendingReviewProducts({ pageSize: 30 }),
      listAutoFlaggedProducts({ pageSize: 30 }),
    ]);

    container.replaceChildren();

    // Auto-flagged products (URGENT — show first)
    if (flagged.items.length > 0) {
      container.appendChild(
        el('div', { className: 'banner banner-warning mb-6' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: `⚠️ ${flagged.items.length} Produk Auto-Flagged` }),
            el('p', { className: 'banner__desc', text: 'Produk dengan kata terlarang yang di-suspend otomatis. Review manual sebelum approve/reject.' }),
          ]),
        ])
      );

      container.appendChild(el('h2', { className: 'mb-4', text: 'Auto-Flagged (Suspended)' }));
      flagged.items.forEach((p) => container.appendChild(renderProductCard(p, adminId, container, true)));
    }

    // Pending review (normal)
    container.appendChild(el('h2', { className: 'mt-6 mb-4', text: 'Pending Review' }));
    if (pending.items.length === 0 && flagged.items.length === 0) {
      container.appendChild(EmptyState({ icon: '✅', title: 'Tidak ada produk untuk review', desc: 'Semua produk sudah diproses.' }));
    } else if (pending.items.length === 0) {
      container.appendChild(EmptyState({ icon: '✅', title: 'Tidak ada pending review', desc: 'Semua pending products sudah diproses.' }));
    } else {
      pending.items.forEach((p) => container.appendChild(renderProductCard(p, adminId, container, false)));
    }
  } catch (err) {
    console.error('[admin moderation] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat queue', desc: err.message }));
  }
}

function renderProductCard(p, adminId, container, isFlagged) {
  const card = el('div', { className: 'card mb-4' });

  card.appendChild(
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: `Produk #${p.id.slice(-8).toUpperCase()} • Seller: ${p.sellerId.slice(0, 12) || '...'}...` }),
        el('p', { className: 'text-xs text-muted', text: `Submitted: ${formatDate(p.submittedAt || p.autoFlaggedAt)}` }),
      ]),
      el('span', { className: 'badge badge-' + (isFlagged ? 'danger' : 'warning'), text: isFlagged ? 'AUTO-FLAGGED' : 'PENDING REVIEW' }),
    ])
  );

  // Layout: image + info
  card.appendChild(
    el('div', { className: 'checkout-seller-group' }, [
      el('div', { className: 'row gap-4' }, [
        el('div', { className: 'product-row__img', style: { width: '80px', height: '80px', flexShrink: '0' } }, [
          p.images?.[0]?.publicId
            ? el('img', { attrs: { src: getImageUrl(p.images[0].publicId, { width: 160, height: 160, crop: 'fill', quality: 'auto' }), alt: p.name, loading: 'lazy' }, style: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' } })
            : el('span', { html: '🖼️', style: { fontSize: '32px' } }),
        ]),
        el('div', { className: '', style: { flex: '1', minWidth: '0' } }, [
          el('h3', { className: 'fw-600 mb-2', text: p.name }),
          el('p', { className: 'text-sm text-success fw-600', text: formatRupiah(p.price) }),
          el('p', { className: 'text-xs text-muted mt-2', text: `Category: ${p.categoryName || p.category} • Stok: ${p.stock || 0} • Berat: ${p.weight || 0}g` }),
        ]),
      ]),
    ])
  );

  // Description
  if (p.description) {
    card.appendChild(el('p', { className: 'text-sm mt-3', text: truncate(p.description, 200) }));
  }

  // Auto-flag reason
  if (isFlagged && p.suspensionReason) {
    card.appendChild(
      el('div', { className: 'banner banner-danger mt-3' }, [
        el('div', {}, [
          el('h4', { className: 'banner__title', text: 'Alasan Auto-Flag' }),
          el('p', { className: 'banner__desc', text: p.suspensionReason }),
        ]),
      ])
    );
  }

  // Action buttons
  card.appendChild(
    el('div', { className: 'row gap-2 mt-3' }, [
      el('button', {
        className: 'btn btn-success btn-sm',
        text: '✓ Approve',
        onClick: async () => {
          try {
            await approveProduct(p.id, adminId);
            toast.success('Produk di-approve. Sekarang visible di marketplace.');
            loadQueue(container, adminId);
          } catch (err) { toast.error(err.message); }
        },
      }),
      el('button', {
        className: 'btn btn-danger btn-sm',
        text: '✕ Reject',
        onClick: async () => {
          const reason = prompt('Alasan reject:', 'Tidak sesuai kebijakan TokoWarung');
          if (reason === null) return;
          try {
            await rejectProduct(p.id, adminId, reason);
            toast.success('Produk di-reject.');
            loadQueue(container, adminId);
          } catch (err) { toast.error(err.message); }
        },
      }),
      el('button', {
        className: 'btn btn-secondary btn-sm',
        text: '⚠️ Suspend + Add Violation',
        onClick: () => showSuspendModal(p, adminId, container),
      }),
    ])
  );

  return card;
}

function showSuspendModal(product, adminId, container) {
  let violationTypeSelect, actionSelect, descriptionInput;

  showModal({
    title: `Suspend Produk + Add Violation to Seller`,
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: `Produk: ${product.name} • Seller: ${product.sellerId.slice(0, 12)}...` }),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Violation Type' }),
        violationTypeSelect = el('select', { className: 'select' }, [
          el('option', { attrs: { value: 'PROHIBITED_PRODUCT' } }, ['Produk Terlarang']),
          el('option', { attrs: { value: 'FAKE_PRODUCT' } }, ['Produk Palsu']),
          el('option', { attrs: { value: 'PRICE_MANIPULATION' } }, ['Manipulasi Harga']),
          el('option', { attrs: { value: 'POLICY_VIOLATION' } }, ['Pelanggaran Kebijakan']),
          el('option', { attrs: { value: 'OTHER' } }, ['Lainnya']),
        ]),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Action Level' }),
        actionSelect = el('select', { className: 'select' }, [
          el('option', { attrs: { value: 'WARNING' } }, ['WARNING (score +1)']),
          el('option', { attrs: { value: 'RESTRICTED' } }, ['RESTRICTED (score +5)']),
          el('option', { attrs: { value: 'SUSPENDED' } }, ['SUSPENDED (score +20, semua produk di-suspend)']),
          el('option', { attrs: { value: 'BANNED' } }, ['BANNED (score +100, akun diblokir permanen)']),
        ]),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Deskripsi (min 10 karakter)' }),
        descriptionInput = el('textarea', {
          className: 'textarea',
          attrs: { placeholder: 'Detail violation untuk seller + audit log', rows: '4', minlength: '10', required: '' },
        }, [product.suspensionReason || '']),
      ]),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Suspend + Add Violation',
        variant: 'danger',
        onClick: async (c) => {
          const violationType = violationTypeSelect.value;
          const action = actionSelect.value;
          const description = descriptionInput.value.trim();
          if (description.length < 10) return toast.error('Deskripsi minimal 10 karakter.');

          try {
            await suspendProduct(product.id, adminId, `Violation: ${violationType} - ${description}`);
            await addViolation({
              sellerId: product.sellerId,
              adminId,
              violationType,
              description,
              action,
              productId: product.id,
            });
            toast.success(`Produk suspended. Violation ${action} added. Score +${action === 'WARNING' ? 1 : action === 'RESTRICTED' ? 5 : action === 'SUSPENDED' ? 20 : 100}`);
            c();
            loadQueue(container, adminId);
          } catch (err) { toast.error(err.message); }
        },
      },
    ],
  });
}

async function handleLogout() {
  try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); }
}
