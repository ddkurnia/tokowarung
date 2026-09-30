// ============================================
// TokoWarung — Buyer Order Detail Page
// Shows order info, items, shipping, status timeline, payment actions.
// ============================================

import { el, EmptyState, BuyerHeader, BuyerBottomNav } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { getOrderById, updateOrderStatus, cancelOrder } from '../../services/orderService.js';
import { navigate } from '../../router/router.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';
import { ORDER_STATUS, PAYMENT_METHOD } from '../../utils/constants.js';

const PAYMENT_LABELS = {
  [PAYMENT_METHOD.COD]: 'COD (Bayar di Tempat)',
  [PAYMENT_METHOD.QRIS]: 'QRIS',
  [PAYMENT_METHOD.VA]: 'Virtual Account',
  [PAYMENT_METHOD.EWALLET]: 'E-Wallet',
};

const TIMELINE_STEPS = [
  { status: ORDER_STATUS.PENDING_PAYMENT, label: 'Menunggu Pembayaran', icon: '💳' },
  { status: ORDER_STATUS.PAID, label: 'Pembayaran Diterima', icon: '✓' },
  { status: ORDER_STATUS.SELLER_CONFIRMED, label: 'Pesanan Dikonfirmasi', icon: '✓' },
  { status: ORDER_STATUS.PREPARING, label: 'Sedang Disiapkan', icon: '📦' },
  { status: ORDER_STATUS.READY_FOR_PICKUP, label: 'Siap Diambil Kurir', icon: '🛍️' },
  { status: ORDER_STATUS.COURIER_ASSIGNED, label: 'Kurir Ditugaskan', icon: '🛵' },
  { status: ORDER_STATUS.PICKED_UP, label: 'Barang Diambil', icon: '📦' },
  { status: ORDER_STATUS.DELIVERING, label: 'Sedang Dikirim', icon: '🛵' },
  { status: ORDER_STATUS.ARRIVED, label: 'Sampai Tujuan', icon: '📍' },
  { status: ORDER_STATUS.DELIVERED, label: 'Selesai', icon: '✓' },
];

export default async function OrderDetailPage({ params, user, profile }) {
  const orderId = params.id;
  const page = el('div', { className: 'buyer-order-detail' });
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
  main.appendChild(
    el('div', { className: 'row-between mb-4' }, [
      el('h1', { text: 'Detail Pesanan' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '← Daftar Pesanan', onClick: () => navigate('/orders') }),
    ])
  );
  page.appendChild(main);

  const content = el('div', { className: 'order-detail-content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadOrder(content, orderId, user);

  page.appendChild(BuyerBottomNav({ active: 'orders' }));
  return page;
}

async function loadOrder(container, orderId, user) {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      container.replaceChildren(EmptyState({ icon: '❓', title: 'Pesanan tidak ditemukan', desc: 'Pesanan mungkin sudah dihapus.' }));
      return;
    }

    container.replaceChildren();

    // Status timeline
    container.appendChild(renderTimeline(order));

    // Order info card
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: 'Informasi Pesanan' }),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'No. Pesanan' }), el('span', { className: 'fw-700', text: '#' + order.id.slice(-8).toUpperCase() })]),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Status' }), el('span', { className: 'status-pill status-pill--info', text: order.orderStatus.replace(/_/g, ' ') })]),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Metode Bayar' }), el('span', { className: 'fw-600', text: PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod })]),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Tanggal' }), el('span', { className: 'fw-600', text: formatDate(order.timestamps?.createdAt) })]),
      ])
    );

    // Shipping address
    if (order.shippingAddress) {
      container.appendChild(
        el('div', { className: 'card mt-4' }, [
          el('h2', { className: 'mb-4', text: 'Alamat Pengiriman' }),
          el('p', { className: 'fw-600', text: order.shippingAddress.name }),
          el('p', { className: 'text-sm', text: order.shippingAddress.phone }),
          el('p', { className: 'text-sm text-muted', text: order.shippingAddress.fullAddress }),
          order.shippingAddress.note ? el('p', { className: 'text-sm text-muted mt-2', text: 'Patokan: ' + order.shippingAddress.note }) : null,
        ])
      );
    }

    // Items
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: 'Produk Dipesan' }),
        ...(order.items || []).map((it) =>
          el('div', { className: 'checkout-item-row' }, [
            el('div', { className: 'checkout-item-row__img' }, it.image ? el('img', { attrs: { src: it.image, alt: it.name, loading: 'lazy' } }) : el('span', { html: '🖼️' })),
            el('div', { className: 'checkout-item-row__content' }, [
              el('p', { className: 'checkout-item-row__name', text: it.name }),
              el('p', { className: 'text-xs text-muted', text: `${it.qty} × ${formatRupiah(it.price)}` }),
            ]),
            el('p', { className: 'fw-600', text: formatRupiah(it.price * it.qty) }),
          ])
        ),
      ])
    );

    // Payment summary
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: 'Rincian Pembayaran' }),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Subtotal' }), el('span', { className: 'fw-600', text: formatRupiah(order.subtotal) })]),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Ongkir' }), el('span', { className: 'fw-600', text: formatRupiah(order.shippingFee) })]),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Biaya Layanan' }), el('span', { className: 'fw-600', text: formatRupiah(order.serviceFee) })]),
        el('div', { className: 'summary-divider' }),
        el('div', { className: 'summary-row summary-row--total' }, [el('span', { text: 'Total' }), el('span', { className: 'fw-800 text-lg text-success', text: formatRupiah(order.total) })]),
      ])
    );

    // Actions based on status
    const actions = renderActions(order, user, container);
    if (actions) container.appendChild(actions);
  } catch (err) {
    console.error('[order-detail] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat pesanan', desc: 'Coba muat ulang.' }));
  }
}

function renderTimeline(order) {
  const currentIdx = TIMELINE_STEPS.findIndex((s) => s.status === order.orderStatus);
  const isCancelled = order.orderStatus === ORDER_STATUS.CANCELLED;
  const isRefunded = order.orderStatus === ORDER_STATUS.REFUNDED;

  if (isCancelled || isRefunded) {
    return el('div', { className: 'card' }, [
      el('div', { className: 'order-timeline order-timeline--cancelled' }, [
        el('div', { className: 'order-timeline__step is-current' }, [
          el('div', { className: 'order-timeline__icon', html: isRefunded ? '💰' : '✕' }),
          el('div', {}, [
            el('p', { className: 'fw-700', text: isRefunded ? 'Pesanan Direfund' : 'Pesanan Dibatalkan' }),
            el('p', { className: 'text-xs text-muted', text: formatDate(order.timestamps?.updatedAt || order.timestamps?.createdAt) }),
          ]),
        ]),
      ]),
    ]);
  }

  return el('div', { className: 'card' }, [
    el('h2', { className: 'mb-4', text: 'Status Pesanan' }),
    el('div', { className: 'order-timeline' },
      TIMELINE_STEPS.map((step, idx) => {
        const isDone = idx <= currentIdx && currentIdx >= 0;
        const isCurrent = idx === currentIdx;
        return el('div', { className: 'order-timeline__step' + (isDone ? ' is-done' : '') + (isCurrent ? ' is-current' : '') }, [
          el('div', { className: 'order-timeline__icon', html: isDone ? step.icon : '○' }),
          el('div', { className: 'order-timeline__content' }, [
            el('p', { className: 'fw-600' + (isCurrent ? ' text-success' : ''), text: step.label }),
            isCurrent && order.timestamps?.[step.status]
              ? el('p', { className: 'text-xs text-muted', text: formatDate(order.timestamps[step.status]) })
              : null,
          ]),
        ]);
      })
    ),
  ]);
}

function renderActions(order, user, container) {
  const actions = [];

  // Cancel order (only when PENDING_PAYMENT or PAID)
  if ([ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID].includes(order.orderStatus)) {
    actions.push(
      el('button', {
        className: 'btn btn-danger btn-block',
        text: 'Batalkan Pesanan',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Batalkan pesanan?',
            message: 'Pesanan akan dibatalkan dan stok produk akan dikembalikan. Tindakan ini tidak bisa dibatalkan.',
            confirmLabel: 'Ya, batalkan',
            cancelLabel: 'Tidak',
            danger: true,
          });
          if (!ok) return;
          try {
            await cancelOrder(order.id, user.uid);
            toast.success('Pesanan dibatalkan.');
            loadOrder(container, order.id, user);
          } catch (err) {
            toast.error(err.message || 'Gagal membatalkan pesanan.');
          }
        },
      })
    );
  }

  // Confirm delivery (when ARRIVED)
  if (order.orderStatus === ORDER_STATUS.ARRIVED) {
    actions.push(
      el('button', {
        className: 'btn btn-success btn-block',
        text: 'Konfirmasi Penerimaan',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Konfirmasi pesanan diterima?',
            message: 'Pastikan kamu sudah menerima barang dengan kondisi baik sebelum konfirmasi.',
            confirmLabel: 'Ya, sudah terima',
            cancelLabel: 'Belum',
          });
          if (!ok) return;
          try {
            await updateOrderStatus(order.id, ORDER_STATUS.DELIVERED, user.uid, 'Buyer confirmed delivery');
            toast.success('Pesanan selesai. Terima kasih!');
            loadOrder(container, order.id, user);
          } catch (err) {
            toast.error(err.message || 'Gagal konfirmasi pesanan.');
          }
        },
      })
    );
  }

  // Request refund (when DELIVERED)
  if (order.orderStatus === ORDER_STATUS.DELIVERED) {
    actions.push(
      el('button', {
        className: 'btn btn-secondary btn-block',
        text: 'Ajukan Refund',
        onClick: () => toast.info('Fitur refund akan tersedia di Phase 4 (Dispute Center).'),
      })
    );
  }

  if (actions.length === 0) return null;
  return el('div', { className: 'mt-4' }, actions);
}
