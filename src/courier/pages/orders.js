// ============================================
// TokoWarung — Courier Orders List Page
// List assigned orders + accept/reject + delivery status updates.
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listAssignedOrders, subscribeToCourierProfile } from '../../services/courierService.js';
import { courierRejectOrder } from '../../services/orderService.js';
import { navigate } from '../../router/router.js';
import { ROLE, ORDER_STATUS } from '../../utils/constants.js';
import { formatRupiah, formatRelativeTime } from '../../utils/helpers.js';

const STATUS_TABS = [
  { id: 'ALL', label: 'Semua' },
  { id: ORDER_STATUS.COURIER_ASSIGNED, label: 'Perlu Diproses' },
  { id: ORDER_STATUS.COURIER_GOING_TO_PICKUP, label: 'Menuju Toko' },
  { id: ORDER_STATUS.DELIVERING, label: 'Sedang Antar' },
  { id: ORDER_STATUS.DELIVERED, label: 'Selesai' },
];

const STATUS_LABELS = {
  [ORDER_STATUS.COURIER_ASSIGNED]: 'Perlu Diproses',
  [ORDER_STATUS.COURIER_GOING_TO_PICKUP]: 'Menuju Toko',
  [ORDER_STATUS.ARRIVED_PICKUP]: 'Sampai Toko',
  [ORDER_STATUS.PICKED_UP]: 'Sudah Pickup',
  [ORDER_STATUS.DELIVERING]: 'Sedang Antar',
  [ORDER_STATUS.ARRIVED]: 'Sampai Tujuan',
  [ORDER_STATUS.DELIVERED]: 'Selesai',
  [ORDER_STATUS.CANCELLED]: 'Dibatalkan',
};

const STATUS_COLORS = {
  [ORDER_STATUS.COURIER_ASSIGNED]: 'warning',
  [ORDER_STATUS.COURIER_GOING_TO_PICKUP]: 'info',
  [ORDER_STATUS.ARRIVED_PICKUP]: 'info',
  [ORDER_STATUS.PICKED_UP]: 'info',
  [ORDER_STATUS.DELIVERING]: 'info',
  [ORDER_STATUS.ARRIVED]: 'info',
  [ORDER_STATUS.DELIVERED]: 'success',
  [ORDER_STATUS.CANCELLED]: 'danger',
};

export default async function CourierOrdersPage({ user, profile }) {
  if (profile?.role !== ROLE.COURIER) {
    navigate('/login?redirect=/courier/orders');
    return el('div');
  }

  const page = el('div', { className: 'dashboard dashboard--courier' });

  // Top bar
  page.appendChild(
    el('header', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Pesanan Saya' }),
      el('div', { className: 'row gap-2' }, [
        el('button', { className: 'btn btn-ghost btn-sm', html: '← Dashboard', onClick: () => navigate('/courier') }),
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  const main = el('main', { className: 'dashboard__content container' });

  // Verification check — if not verified, show banner
  let courierVerified = true;
  const unsub = subscribeToCourierProfile(user.uid, (courier) => {
    courierVerified = courier && courier.status === 'VERIFIED';
    if (!courierVerified && document.getElementById('verifyBanner')) {
      // already shown
      return;
    }
    if (!courierVerified && !document.getElementById('verifyBanner')) {
      const banner = el('div', { id: 'verifyBanner', className: 'banner banner-warning' }, [
        el('div', {}, [
          el('h3', { className: 'banner__title', text: 'Akun belum terverifikasi' }),
          el('p', { className: 'banner__desc', text: 'Tunggu admin verifikasi akunmu untuk melihat order.' }),
        ]),
      ]);
      main.prepend(banner);
    }
  });

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
  main.appendChild(tabs);

  const content = el('div', { className: 'orders-list' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  page.appendChild(main);

  loadOrders(content, user.uid, currentTab);

  return page;
}

async function loadOrders(container, courierId, tab) {
  try {
    const { items } = await listAssignedOrders(courierId, { pageSize: 30, status: tab === 'ALL' ? undefined : tab });

    if (items.length === 0) {
      container.replaceChildren(
        EmptyState({
          icon: '📦',
          title: tab === 'ALL' ? 'Belum ada order' : 'Tidak ada order di tab ini',
          desc: 'Saat ada order masuk, akan tampil di sini. Pastikan kamu sedang online.',
        })
      );
      return;
    }

    container.replaceChildren();
    items.forEach((order) => container.appendChild(renderOrderCard(order, courierId, container)));
  } catch (err) {
    console.error('[courier orders] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat order', desc: err.message }));
  }
}

function renderOrderCard(order, courierId, container) {
  const statusColor = STATUS_COLORS[order.orderStatus] || 'info';
  const statusLabel = STATUS_LABELS[order.orderStatus] || order.orderStatus;
  const card = el('div', { className: 'card order-card' });

  card.appendChild(
    el('div', { className: 'order-card__header' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: '#' + order.id.slice(-8).toUpperCase() }),
        el('p', { className: 'text-xs text-muted', text: formatRelativeTime(order.timestamps?.createdAt) }),
      ]),
      el('span', { className: 'status-pill status-pill--' + statusColor, text: statusLabel }),
    ])
  );

  card.appendChild(
    el('div', { className: 'order-card__body' }, [
      el('p', { className: 'text-sm', text: order.shippingAddress?.name || 'Pembeli' }),
      el('p', { className: 'text-sm text-muted', text: `${order.shippingAddress?.phone || ''}` }),
      el('p', { className: 'text-xs text-muted', text: `${order.items?.length || 0} produk • ${order.shippingAddress?.fullAddress?.slice(0, 40) || ''}...` }),
    ])
  );

  // Action buttons based on status
  const actions = el('div', { className: 'order-card__footer row gap-2' });
  actions.appendChild(
    el('div', {}, [
      el('p', { className: 'text-xs text-muted', text: 'Ongkir + COD' }),
      el('p', { className: 'fw-700 text-success', text: formatRupiah(order.shippingFee + (order.paymentMethod === 'COD' ? order.total : 0)) }),
    ])
  );

  // Reject button (only if COURIER_ASSIGNED)
  if (order.orderStatus === ORDER_STATUS.COURIER_ASSIGNED) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-secondary btn-sm',
        text: 'Tolak',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Tolak order ini?',
            message: 'Order akan dialihkan ke kurir lain. Kamu tidak akan mendapat penghasilan dari order ini.',
            confirmLabel: 'Ya, tolak',
            cancelLabel: 'Batal',
            danger: true,
          });
          if (!ok) return;
          try {
            await courierRejectOrder(order.id, courierId, 'Courier rejected');
            toast.success('Order ditolak.');
            loadOrders(container, courierId, 'ALL');
          } catch (err) { toast.error(err.message); }
        },
      })
    );
  }

  // Detail button (always)
  actions.appendChild(
    el('button', {
      className: 'btn btn-primary btn-sm',
      text: 'Proses',
      onClick: () => navigate('/courier/orders/' + order.id),
    })
  );

  card.appendChild(actions);
  return card;
}

async function handleLogout() {
  try {
    await logout();
    toast.success('Berhasil keluar.');
    navigate('/login');
  } catch (err) { toast.error('Gagal keluar.'); }
}
