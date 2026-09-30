// ============================================
// TokoWarung — Order Success Page
// Show confirmation after checkout, link to order detail.
// ============================================

import { el, EmptyState, BuyerHeader, BuyerBottomNav } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { getOrderById } from '../../services/orderService.js';
import { navigate } from '../../router/router.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';
import { PAYMENT_METHOD, ORDER_STATUS } from '../../utils/constants.js';

const PAYMENT_LABELS = {
  [PAYMENT_METHOD.COD]: 'COD (Bayar di Tempat)',
  [PAYMENT_METHOD.QRIS]: 'QRIS',
  [PAYMENT_METHOD.VA]: 'Virtual Account',
  [PAYMENT_METHOD.EWALLET]: 'E-Wallet',
};

export default async function OrderSuccessPage({ params, user, profile, queryParams }) {
  const orderId = params.id;
  const allOrderIds = (queryParams.get('orders') || orderId).split(',').filter(Boolean);

  const page = el('div', { className: 'order-success' });
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

  const main = el('main', { className: 'container mt-6 order-success__main' });
  page.appendChild(main);

  // Hero success
  main.appendChild(
    el('div', { className: 'order-success__hero' }, [
      el('div', { className: 'order-success__check', html: '✓' }),
      el('h1', { className: 'order-success__title', text: 'Pesanan Berhasil Dibuat!' }),
      el('p', { className: 'order-success__subtitle text-muted', text: 'Kami sudah terima pesananmu. Lanjutkan pembayaran untuk konfirmasi.' }),
    ])
  );

  // Order details
  const content = el('div', { className: 'order-success__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadOrder(content, orderId, allOrderIds);

  // Actions
  main.appendChild(
    el('div', { className: 'order-success__actions' }, [
      el('button', {
        className: 'btn btn-primary btn-lg',
        text: 'Lihat Detail Pesanan',
        onClick: () => navigate('/orders/' + orderId),
      }),
      el('button', {
        className: 'btn btn-secondary btn-lg',
        text: 'Lihat Pesanan Saya',
        onClick: () => navigate('/orders'),
      }),
      el('button', {
        className: 'btn btn-ghost',
        text: 'Kembali Belanja',
        onClick: () => navigate('/'),
      }),
    ])
  );

  page.appendChild(BuyerBottomNav({ active: 'orders' }));

  return page;
}

async function loadOrder(container, orderId, allOrderIds) {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      container.replaceChildren(
        EmptyState({ icon: '❓', title: 'Pesanan tidak ditemukan', desc: 'Pesanan mungkin sudah dihapus.' })
      );
      return;
    }

    container.replaceChildren();
    container.appendChild(
      el('div', { className: 'card order-success__card' }, [
        el('div', { className: 'row-between mb-4' }, [
          el('div', {}, [
            el('p', { className: 'text-xs text-muted', text: 'Nomor Pesanan' }),
            el('p', { className: 'fw-700', text: '#' + orderId.slice(-8).toUpperCase() }),
          ]),
          el('div', { className: 'status-pill status-pill--info', text: order.orderStatus.replace(/_/g, ' ') }),
        ]),
        el('div', { className: 'summary-row' }, [
          el('span', { className: 'text-sm text-muted', text: 'Total Bayar' }),
          el('span', { className: 'fw-700 text-lg text-success', text: formatRupiah(order.total) }),
        ]),
        el('div', { className: 'summary-row' }, [
          el('span', { className: 'text-sm text-muted', text: 'Metode Pembayaran' }),
          el('span', { className: 'fw-600', text: PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod }),
        ]),
        el('div', { className: 'summary-row' }, [
          el('span', { className: 'text-sm text-muted', text: 'Dibuat pada' }),
          el('span', { className: 'fw-600', text: formatDate(order.timestamps?.createdAt) }),
        ]),
      ])
    );

    if (order.paymentMethod === PAYMENT_METHOD.COD) {
      container.appendChild(
        el('div', { className: 'banner banner-warning mt-4' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: '💵 Pembayaran COD' }),
            el('p', { className: 'banner__desc', text: 'Siapakan uang pas saat kurir sampai. Total: ' + formatRupiah(order.total) }),
          ]),
        ])
      );
    } else {
      container.appendChild(
        el('div', { className: 'banner banner-info mt-4' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: 'Instruksi Pembayaran' }),
            el('p', { className: 'banner__desc', text: 'Halaman pembayaran otomatis akan tersedia setelah integrasi payment gateway di Phase 3. Sementara ini, admin akan verifikasi manual.' }),
          ]),
        ])
      );
    }

    if (allOrderIds.length > 1) {
      container.appendChild(
        el('div', { className: 'card mt-4' }, [
          el('h3', { className: 'mb-2', text: `Pesanan lainnya (${allOrderIds.length - 1})` }),
          el('p', { className: 'text-sm text-muted', text: 'Kamu membuat beberapa pesanan dari toko berbeda. Lihat semua di halaman Pesanan Saya.' }),
        ])
      );
    }
  } catch (err) {
    console.error('[order-success] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat pesanan', desc: 'Cek koneksi internet.' }));
  }
}
