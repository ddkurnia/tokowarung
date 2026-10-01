// ============================================
// TokoWarung — Seller Orders Page
// List incoming orders + status update actions.
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listSellerOrders, updateOrderStatus } from '../../services/orderService.js';
import { navigate } from '../../router/router.js';
import { ROLE, ORDER_STATUS } from '../../utils/constants.js';
import { formatRupiah, formatRelativeTime, formatDate } from '../../utils/helpers.js';

const STATUS_LABELS = {
  [ORDER_STATUS.PENDING_PAYMENT]: 'Perlu Bayar',
  [ORDER_STATUS.PAID]: 'Sudah Bayar',
  [ORDER_STATUS.SELLER_CONFIRMED]: 'Dikonfirmasi',
  [ORDER_STATUS.PREPARING]: 'Disiapkan',
  [ORDER_STATUS.READY_FOR_PICKUP]: 'Siap Diambil',
  [ORDER_STATUS.COURIER_ASSIGNED]: 'Kurir Ditugaskan',
  [ORDER_STATUS.DELIVERING]: 'Dikirim',
  [ORDER_STATUS.DELIVERED]: 'Selesai',
  [ORDER_STATUS.CANCELLED]: 'Dibatalkan',
};

const STATUS_TABS = [
  { id: 'ALL', label: 'Semua' },
  { id: ORDER_STATUS.PAID, label: 'Perlu Proses' },
  { id: ORDER_STATUS.PREPARING, label: 'Disiapkan' },
  { id: ORDER_STATUS.READY_FOR_PICKUP, label: 'Siap Diambil' },
  { id: ORDER_STATUS.DELIVERED, label: 'Selesai' },
];

const STATUS_COLORS = {
  [ORDER_STATUS.PENDING_PAYMENT]: 'warning',
  [ORDER_STATUS.PAID]: 'info',
  [ORDER_STATUS.SELLER_CONFIRMED]: 'info',
  [ORDER_STATUS.PREPARING]: 'info',
  [ORDER_STATUS.READY_FOR_PICKUP]: 'info',
  [ORDER_STATUS.COURIER_ASSIGNED]: 'info',
  [ORDER_STATUS.DELIVERING]: 'info',
  [ORDER_STATUS.DELIVERED]: 'success',
  [ORDER_STATUS.CANCELLED]: 'danger',
};

export default async function SellerOrdersPage({ user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller/orders');
    return el('div');
  }

  const page = el('div', { className: 'dashboard' });
  page.appendChild(renderSidebar('orders'));

  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Pesanan' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'dashboard__content' });
  main.appendChild(content);

  // Tabs
  let currentTab = 'ALL';
  const tabs = el('div', { className: 'tab-bar mb-6' });
  STATUS_TABS.forEach((t) => {
    tabs.appendChild(
      el('button', {
        className: 'tab-item',
        attrs: { 'aria-selected': t.id === 'ALL' ? 'true' : 'false', 'data-tab': t.id },
        text: t.label,
        onClick: (e) => {
          currentTab = t.id;
          tabs.querySelectorAll('.tab-item').forEach((b) => b.setAttribute('aria-selected', 'false'));
          e.target.setAttribute('aria-selected', 'true');
          loadOrders(content, user.uid, currentTab);
        },
      })
    );
  });
  content.appendChild(tabs);

  const list = el('div', { className: 'orders-list' });
  list.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  content.appendChild(list);

  loadOrders(list, user.uid, currentTab);

  return page;
}

async function loadOrders(container, sellerId, tab) {
  try {
    const { items } = await listSellerOrders(sellerId, { pageSize: 30, status: tab === 'ALL' ? undefined : tab });

    if (items.length === 0) {
      container.replaceChildren(
        EmptyState({
          icon: '📋',
          title: 'Belum ada pesanan',
          desc: 'Pesanan masuk akan muncul di sini. Pastikan toko sudah terverifikasi.',
        })
      );
      return;
    }

    container.replaceChildren();
    items.forEach((order) => container.appendChild(renderOrderCard(order, sellerId, container)));
  } catch (err) {
    console.error('[seller orders] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat pesanan', desc: 'Coba muat ulang.' }));
  }
}

function renderOrderCard(order, sellerId, container) {
  const statusColor = STATUS_COLORS[order.orderStatus] || 'info';
  const statusLabel = STATUS_LABELS[order.orderStatus] || order.orderStatus;
  const card = el('div', { className: 'card order-card' });

  // Header
  card.appendChild(
    el('div', { className: 'order-card__header' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: '#' + order.id.slice(-8).toUpperCase() }),
        el('p', { className: 'text-xs text-muted', text: formatRelativeTime(order.timestamps?.createdAt) }),
      ]),
      el('span', { className: 'status-pill status-pill--' + statusColor, text: statusLabel }),
    ])
  );

  // Items summary
  const itemsCount = order.items?.length || 0;
  const firstItem = order.items?.[0];
  card.appendChild(
    el('div', { className: 'order-card__body' }, [
      el('p', { className: 'text-sm', text: firstItem ? `${firstItem.name}${itemsCount > 1 ? ` +${itemsCount - 1} lainnya` : ''}` : '—' }),
      el('p', { className: 'text-sm text-muted', text: `${itemsCount} produk • ${order.shippingAddress?.name || 'Pembeli'}` }),
    ])
  );

  // Footer with total + action buttons
  const actions = renderSellerActions(order, sellerId, container);
  card.appendChild(
    el('div', { className: 'order-card__footer' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: 'Total' }),
        el('p', { className: 'fw-700 text-success', text: formatRupiah(order.total) }),
      ]),
      actions,
    ])
  );

  return card;
}

function renderSellerActions(order, sellerId, container) {
  const actions = el('div', { className: 'row gap-2' });

  // Paid → confirm
  if (order.orderStatus === ORDER_STATUS.PAID) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-primary btn-sm',
        text: 'Konfirmasi',
        onClick: async () => {
          try {
            await updateOrderStatus(order.id, ORDER_STATUS.SELLER_CONFIRMED, sellerId, 'Order confirmed by seller');
            toast.success('Pesanan dikonfirmasi.');
            loadOrders(container, sellerId, 'ALL');
          } catch (err) {
            toast.error(err.message || 'Gagal konfirmasi.');
          }
        },
      })
    );
  }

  // Seller confirmed → preparing
  if (order.orderStatus === ORDER_STATUS.SELLER_CONFIRMED) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-primary btn-sm',
        text: 'Mulai Siapkan',
        onClick: async () => {
          try {
            await updateOrderStatus(order.id, ORDER_STATUS.PREPARING, sellerId, 'Seller started preparing');
            toast.success('Pesanan sedang disiapkan.');
            loadOrders(container, sellerId, 'ALL');
          } catch (err) {
            toast.error(err.message || 'Gagal update status.');
          }
        },
      })
    );
  }

  // Preparing → ready for pickup
  if (order.orderStatus === ORDER_STATUS.PREPARING) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-success btn-sm',
        text: 'Siap Diambil',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Pesanan siap diambil?',
            message: 'Sistem akan cari kurir yang available untuk pickup.',
            confirmLabel: 'Ya, sudah siap',
            cancelLabel: 'Belum',
          });
          if (!ok) return;
          try {
            await updateOrderStatus(order.id, ORDER_STATUS.READY_FOR_PICKUP, sellerId, 'Order ready for pickup');
            toast.success('Pesanan siap diambil. Mencari kurir...');
            loadOrders(container, sellerId, 'ALL');
          } catch (err) {
            toast.error(err.message || 'Gagal update status.');
          }
        },
      })
    );
  }

  // View detail button (always)
  actions.appendChild(
    el('button', {
      className: 'btn btn-secondary btn-sm',
      text: 'Detail',
      onClick: () => navigate('/seller/orders/' + order.id),
    })
  );

  return actions;
}

function renderSidebar(active) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', href: '#/seller', icon: '📊' },
    { id: 'products', label: 'Produk', href: '#/seller/products', icon: '📦' },
    { id: 'orders', label: 'Pesanan', href: '#/seller/orders', icon: '📋' },
    { id: 'finance', label: 'Keuangan', href: '#/seller/finance', icon: '💰' },
    { id: 'vouchers', label: 'Voucher', href: '#/seller/vouchers', icon: '🎟️' },
    { id: 'ads', label: 'Iklan', href: '#/seller/ads', icon: '📢' },
    { id: 'settings', label: 'Pengaturan Toko', href: '#/seller/settings', icon: '⚙️' },
  ];
  const nav = el('aside', { className: 'dashboard__sidebar' });
  nav.appendChild(el('div', { className: 'dashboard__brand', html: 'Toko<span>Warung</span> Seller' }));
  items.forEach((it) => {
    nav.appendChild(
      el('a', { className: 'nav-item' + (it.id === active ? ' is-active' : ''), href: it.href }, [
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
