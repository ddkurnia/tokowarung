// ============================================
// TokoWarung — Buyer Orders List Page
// List all orders by current buyer with status pills + filter tabs.
// ============================================

import { el, EmptyState, BuyerHeader, BuyerBottomNav } from '../../components/ui.js';
import { listBuyerOrders } from '../../services/orderService.js';
import { navigate } from '../../router/router.js';
import { formatRupiah, formatRelativeTime } from '../../utils/helpers.js';
import { ORDER_STATUS } from '../../utils/constants.js';

const STATUS_TABS = [
  { id: 'ALL', label: 'Semua' },
  { id: ORDER_STATUS.PENDING_PAYMENT, label: 'Perlu Bayar' },
  { id: ORDER_STATUS.PAID, label: 'Diproses' },
  { id: ORDER_STATUS.DELIVERING, label: 'Dikirim' },
  { id: ORDER_STATUS.DELIVERED, label: 'Selesai' },
];

const STATUS_COLORS = {
  [ORDER_STATUS.PENDING_PAYMENT]: 'warning',
  [ORDER_STATUS.PAID]: 'info',
  [ORDER_STATUS.SELLER_CONFIRMED]: 'info',
  [ORDER_STATUS.PREPARING]: 'info',
  [ORDER_STATUS.READY_FOR_PICKUP]: 'info',
  [ORDER_STATUS.COURIER_ASSIGNED]: 'info',
  [ORDER_STATUS.COURIER_GOING_TO_PICKUP]: 'info',
  [ORDER_STATUS.PICKED_UP]: 'info',
  [ORDER_STATUS.DELIVERING]: 'info',
  [ORDER_STATUS.ARRIVED]: 'info',
  [ORDER_STATUS.DELIVERED]: 'success',
  [ORDER_STATUS.CANCELLED]: 'danger',
  [ORDER_STATUS.REFUND_REQUESTED]: 'warning',
  [ORDER_STATUS.REFUNDED]: 'success',
  [ORDER_STATUS.DISPUTED]: 'danger',
};

const STATUS_LABELS = {
  [ORDER_STATUS.PENDING_PAYMENT]: 'Perlu Bayar',
  [ORDER_STATUS.PAID]: 'Sudah Bayar',
  [ORDER_STATUS.SELLER_CONFIRMED]: 'Dikonfirmasi',
  [ORDER_STATUS.PREPARING]: 'Disiapkan',
  [ORDER_STATUS.READY_FOR_PICKUP]: 'Siap Diambil',
  [ORDER_STATUS.COURIER_ASSIGNED]: 'Kurir Ditugaskan',
  [ORDER_STATUS.COURIER_GOING_TO_PICKUP]: 'Kurir Menuju Toko',
  [ORDER_STATUS.PICKED_UP]: 'Sudah Diambil',
  [ORDER_STATUS.DELIVERING]: 'Sedang Dikirim',
  [ORDER_STATUS.ARRIVED]: 'Sampai Tujuan',
  [ORDER_STATUS.DELIVERED]: 'Selesai',
  [ORDER_STATUS.CANCELLED]: 'Dibatalkan',
  [ORDER_STATUS.REFUND_REQUESTED]: 'Pengajuan Refund',
  [ORDER_STATUS.REFUNDED]: 'Sudah Refund',
  [ORDER_STATUS.DISPUTED]: 'Sengketa',
};

export default async function OrdersListPage({ user, profile }) {
  const page = el('div', { className: 'buyer-orders' });
  page.appendChild(
    BuyerHeader({
      location: profile?.location?.label || 'Jakarta',
      onSearch: (q) => navigate('/search', { q }),
      onCart: () => navigate('/cart'),
      onBell: () => navigate('/notifications'),
      cartCount: 0,
      notifCount: 0,
    })
  );

  const main = el('main', { className: 'container mt-6' });
  main.appendChild(el('h1', { className: 'mb-4', text: 'Pesanan Saya' }));
  page.appendChild(main);

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
          loadOrders(content, user, currentTab);
        },
      })
    );
  });
  main.appendChild(tabs);

  const content = el('div', { className: 'orders-list' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadOrders(content, user, currentTab);

  page.appendChild(BuyerBottomNav({ active: 'orders' }));
  return page;
}

async function loadOrders(container, user, tab) {
  try {
    const { items } = await listBuyerOrders(user.uid, { pageSize: 20, status: tab === 'ALL' ? undefined : tab });

    if (items.length === 0) {
      container.replaceChildren(
        EmptyState({
          icon: '📦',
          title: tab === 'ALL' ? 'Belum ada pesanan' : `Tidak ada pesanan ${STATUS_TABS.find(t => t.id === tab)?.label || ''}`,
          desc: 'Mulai belanja dari toko lokal sekitarmu untuk membuat pesanan pertama.',
          action: el('button', { className: 'btn btn-primary', text: 'Mulai Belanja', onClick: () => navigate('/') }),
        })
      );
      return;
    }

    container.replaceChildren();
    items.forEach((order) => {
      container.appendChild(renderOrderCard(order));
    });
  } catch (err) {
    console.error('[orders] load error:', err);
    container.replaceChildren(
      EmptyState({
        icon: '⚠️',
        title: 'Gagal memuat pesanan',
        desc: 'Coba muat ulang halaman.',
        action: el('button', { className: 'btn btn-primary', text: 'Muat Ulang', onClick: () => window.location.reload() }),
      })
    );
  }
}

function renderOrderCard(order) {
  const statusColor = STATUS_COLORS[order.orderStatus] || 'info';
  const statusLabel = STATUS_LABELS[order.orderStatus] || order.orderStatus;
  const firstItem = order.items?.[0];
  const additionalItemsCount = (order.items?.length || 0) - 1;

  return el('a', {
    className: 'card order-card',
    href: '#/orders/' + order.id,
  }, [
    el('div', { className: 'order-card__header' }, [
      el('div', {}, [
        el('p', { className: 'text-xs text-muted', text: 'No. Pesanan' }),
        el('p', { className: 'fw-700', text: '#' + order.id.slice(-8).toUpperCase() }),
      ]),
      el('span', { className: 'status-pill status-pill--' + statusColor, text: statusLabel }),
    ]),
    el('div', { className: 'order-card__body' }, [
      firstItem
        ? el('div', { className: 'order-card__items' }, [
            el('span', { className: 'text-sm', text: `${firstItem.name}${additionalItemsCount > 0 ? ` +${additionalItemsCount} lainnya` : ''}` }),
          ])
        : null,
      el('p', { className: 'text-xs text-muted', text: formatRelativeTime(order.timestamps?.createdAt) }),
    ]),
    el('div', { className: 'order-card__footer' }, [
      el('span', { className: 'text-sm text-muted', text: 'Total' }),
      el('span', { className: 'fw-700 text-success', text: formatRupiah(order.total) }),
    ]),
  ]);
}
