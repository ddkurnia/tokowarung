// ============================================
// TokoWarung — Seller Order Detail Page
// View order details, status timeline, status action buttons,
// show pickup code to courier (after COURIER_ASSIGNED).
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { getOrderById, updateOrderStatus, autoAssignCourier, cancelOrder } from '../../services/orderService.js';
import { navigate } from '../../router/router.js';
import { ROLE, ORDER_STATUS } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';

const PAYMENT_LABELS = {
  COD: 'COD (Bayar di Tempat)',
  QRIS: 'QRIS',
  VIRTUAL_ACCOUNT: 'Virtual Account',
  EWALLET: 'E-Wallet',
};

const TIMELINE_STEPS = [
  { status: 'PENDING_PAYMENT', label: 'Menunggu Pembayaran', icon: '💳' },
  { status: 'PAID', label: 'Pembayaran Diterima', icon: '✓' },
  { status: 'SELLER_CONFIRMED', label: 'Pesanan Dikonfirmasi', icon: '✓' },
  { status: 'PREPARING', label: 'Sedang Disiapkan', icon: '📦' },
  { status: 'READY_FOR_PICKUP', label: 'Siap Diambil Kurir', icon: '🛍️' },
  { status: 'COURIER_ASSIGNED', label: 'Kurir Ditugaskan', icon: '🛵' },
  { status: 'PICKED_UP', label: 'Sudah Diambil Kurir', icon: '📦' },
  { status: 'DELIVERING', label: 'Sedang Dikirim', icon: '🛵' },
  { status: 'ARRIVED', label: 'Sampai Tujuan', icon: '📍' },
  { status: 'DELIVERED', label: 'Selesai', icon: '✓' },
];

export default async function SellerOrderDetailPage({ params, user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller/orders/' + params.id);
    return el('div');
  }

  const orderId = params.id;
  const page = el('div', { className: 'dashboard' });
  page.appendChild(renderSidebar());

  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('div', { className: 'row' }, [
        el('h1', { className: 'dashboard__title', text: 'Detail Pesanan' }),
      ]),
      el('div', { className: 'row gap-2' }, [
        el('button', { className: 'btn btn-ghost btn-sm', html: '← Kembali', onClick: () => navigate('/seller/orders') }),
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  const content = el('div', { className: 'dashboard__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadOrder(content, orderId, user.uid);

  return page;
}

async function loadOrder(container, orderId, sellerId) {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      container.replaceChildren(EmptyState({ icon: '❓', title: 'Pesanan tidak ditemukan' }));
      return;
    }

    // Verify ownership
    if (order.sellerId !== sellerId) {
      container.replaceChildren(EmptyState({ icon: '🔒', title: 'Akses ditolak', desc: 'Pesanan ini bukan milikmu.' }));
      return;
    }

    container.replaceChildren();

    // Status timeline
    container.appendChild(renderTimeline(order));

    // Order info
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

    // Pickup code (show to courier — visible setelah COURIER_ASSIGNED)
    if (order.pickupCode && [ORDER_STATUS.COURIER_ASSIGNED, ORDER_STATUS.COURIER_GOING_TO_PICKUP, ORDER_STATUS.ARRIVED_PICKUP].includes(order.orderStatus)) {
      container.appendChild(
        el('div', { className: 'banner banner-info mt-4' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: '🔑 Pickup Code untuk Kurir' }),
            el('p', { className: 'banner__desc', text: 'Berikan code ini ke kurir saat pickup. Setelah kurir verify code, pesanan otomatis berubah ke PICKED_UP.' }),
            el('p', { className: 'fw-800 text-2xl text-info mt-2', text: order.pickupCode }),
          ]),
        ])
      );
    }

    // Courier info (jika sudah di-assign)
    if (order.courierId) {
      container.appendChild(
        el('div', { className: 'card mt-4' }, [
          el('h2', { className: 'mb-4', text: 'Kurir' }),
          el('p', { className: 'text-sm text-muted', text: 'Courier ID: ' + order.courierId.slice(0, 12) + '...' }),
          el('p', { className: 'text-sm', text: 'Status: ' + order.orderStatus }),
        ])
      );
    }

    // Actions
    const actions = renderActions(order, sellerId, container);
    if (actions) container.appendChild(actions);
  } catch (err) {
    console.error('[seller order detail] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat pesanan', desc: err.message || 'Coba muat ulang.' }));
  }
}

function renderTimeline(order) {
  const currentIdx = TIMELINE_STEPS.findIndex((s) => s.status === order.orderStatus);
  const isCancelled = order.orderStatus === ORDER_STATUS.CANCELLED;

  if (isCancelled) {
    return el('div', { className: 'card' }, [
      el('div', { className: 'order-timeline order-timeline--cancelled' }, [
        el('div', { className: 'order-timeline__step is-current' }, [
          el('div', { className: 'order-timeline__icon', html: '✕' }),
          el('div', {}, [el('p', { className: 'fw-700', text: 'Pesanan Dibatalkan' })]),
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
            isCurrent && order.timestamps?.[step.status] ? el('p', { className: 'text-xs text-muted', text: formatDate(order.timestamps[step.status]) }) : null,
          ]),
        ]);
      })
    ),
  ]);
}

function renderActions(order, sellerId, container) {
  const actions = el('div', { className: 'mt-4' });

  // PAID → Confirm
  if (order.orderStatus === ORDER_STATUS.PAID) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-primary btn-block',
        text: 'Konfirmasi Pesanan',
        onClick: async () => {
          try {
            await updateOrderStatus(order.id, ORDER_STATUS.SELLER_CONFIRMED, sellerId, 'Confirmed by seller');
            toast.success('Pesanan dikonfirmasi.');
            loadOrder(container, order.id, sellerId);
          } catch (err) { toast.error(err.message); }
        },
      })
    );
  }

  // SELLER_CONFIRMED → Start preparing
  if (order.orderStatus === ORDER_STATUS.SELLER_CONFIRMED) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-primary btn-block',
        text: 'Mulai Siapkan',
        onClick: async () => {
          try {
            await updateOrderStatus(order.id, ORDER_STATUS.PREPARING, sellerId, 'Seller started preparing');
            toast.success('Pesanan sedang disiapkan.');
            loadOrder(container, order.id, sellerId);
          } catch (err) { toast.error(err.message); }
        },
      })
    );
  }

  // PREPARING → Ready for pickup (auto-assign courier)
  if (order.orderStatus === ORDER_STATUS.PREPARING) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-success btn-block',
        text: 'Pesanan Siap — Cari Kurir',
        onClick: async () => {
          try {
            await updateOrderStatus(order.id, ORDER_STATUS.READY_FOR_PICKUP, sellerId, 'Ready for pickup');
            toast.info('Mencari kurir yang tersedia...');
            // Auto-assign courier (simplified — proper solution pakai Cloud Function)
            setTimeout(async () => {
              try {
                const result = await autoAssignCourier(order.id, sellerId);
                toast.success(`Kurir ditugaskan! Pickup code: ${result.pickupCode}`);
                loadOrder(container, order.id, sellerId);
              } catch (err) {
                toast.warning(err.message);
                loadOrder(container, order.id, sellerId);
              }
            }, 1000);
          } catch (err) { toast.error(err.message); }
        },
      })
    );
  }

  // Cancel order (only when PENDING_PAYMENT, PAID, or READY_FOR_PICKUP)
  if ([ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID, ORDER_STATUS.READY_FOR_PICKUP].includes(order.orderStatus)) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-danger btn-block mt-2',
        text: 'Batalkan Pesanan',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Batalkan pesanan?',
            message: 'Stok produk akan dikembalikan. Tindakan tidak bisa dibatalkan.',
            confirmLabel: 'Ya, batalkan',
            cancelLabel: 'Tidak',
            danger: true,
          });
          if (!ok) return;
          try {
            await cancelOrder(order.id, sellerId);
            toast.success('Pesanan dibatalkan.');
            loadOrder(container, order.id, sellerId);
          } catch (err) { toast.error(err.message); }
        },
      })
    );
  }

  return actions.children.length > 0 ? actions : null;
}

function renderSidebar() {
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
    nav.appendChild(el('a', { className: 'nav-item' + (it.id === 'orders' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  return nav;
}

async function handleLogout() {
  try {
    await logout();
    toast.success('Berhasil keluar.');
    navigate('/login');
  } catch (err) { toast.error('Gagal keluar.'); }
}
