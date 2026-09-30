// ============================================
// TokoWarung — Courier Order Detail Page
// Accept/reject, enter pickup code, mark delivering/arrived, enter delivery OTP
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { getOrderById, courierAcceptOrder, courierRejectOrder, verifyPickupCode, markDelivering, markArrived } from '../../services/orderService.js';
import { navigate } from '../../router/router.js';
import { ROLE, ORDER_STATUS } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';

export default async function CourierOrderDetailPage({ params, user, profile }) {
  if (profile?.role !== ROLE.COURIER) {
    navigate('/login?redirect=/courier/orders/' + params.id);
    return el('div');
  }

  const orderId = params.id;
  const page = el('div', { className: 'dashboard dashboard--courier' });

  page.appendChild(
    el('header', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Detail Order' }),
      el('div', { className: 'row gap-2' }, [
        el('button', { className: 'btn btn-ghost btn-sm', html: '← Daftar', onClick: () => navigate('/courier/orders') }),
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  const main = el('main', { className: 'dashboard__content container' });
  page.appendChild(main);

  const content = el('div', { className: 'order-detail-content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadOrder(content, orderId, user.uid);

  return page;
}

async function loadOrder(container, orderId, courierId) {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      container.replaceChildren(EmptyState({ icon: '❓', title: 'Order tidak ditemukan' }));
      return;
    }
    if (order.courierId !== courierId) {
      container.replaceChildren(EmptyState({ icon: '🔒', title: 'Akses ditolak', desc: 'Order ini bukan ditugaskan ke kamu.' }));
      return;
    }

    container.replaceChildren();

    // Status banner
    container.appendChild(
      el('div', { className: 'card' }, [
        el('h2', { className: 'mb-4', text: 'Status Order' }),
        el('p', { className: 'fw-700 text-lg', text: order.orderStatus.replace(/_/g, ' ') }),
        el('p', { className: 'text-sm text-muted mt-2', text: 'Terakhir diupdate: ' + formatDate(order.timestamps?.updatedAt) }),
      ])
    );

    // Order info
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: 'Informasi Order' }),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'No. Order' }), el('span', { className: 'fw-700', text: '#' + order.id.slice(-8).toUpperCase() })]),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Metode Bayar' }), el('span', { className: 'fw-600', text: order.paymentMethod })]),
        el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'COD Amount' }), el('span', { className: 'fw-700 text-success', text: order.paymentMethod === 'COD' ? formatRupiah(order.total) : '—' })]),
      ])
    );

    // Pickup address (seller)
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: '🏪 Lokasi Pickup (Toko)' }),
        el('p', { className: 'fw-600', text: 'Toko: ' + (order.sellerName || 'Unknown') }),
        el('p', { className: 'text-sm text-muted', text: 'Seller ID: ' + order.sellerId.slice(0, 12) + '...' }),
        // Note: actual address belum disimpan di order, akan ditambah di Phase 2.6
        el('p', { className: 'text-sm text-muted mt-2', text: 'Hubungi seller via chat bila perlu koordinasi pickup.' }),
      ])
    );

    // Customer / shipping address
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: '📍 Tujuan Antar' }),
        el('p', { className: 'fw-600', text: order.shippingAddress?.name }),
        el('p', { className: 'text-sm', text: order.shippingAddress?.phone }),
        el('p', { className: 'text-sm text-muted', text: order.shippingAddress?.fullAddress }),
        order.shippingAddress?.note ? el('p', { className: 'text-sm text-muted mt-2', text: 'Patokan: ' + order.shippingAddress.note }) : null,
      ])
    );

    // Items
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: '📦 Barang Diantar' }),
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

    // Pickup code (untuk di-verify ke seller)
    if (order.pickupCode && [ORDER_STATUS.COURIER_GOING_TO_PICKUP, ORDER_STATUS.ARRIVED_PICKUP].includes(order.orderStatus)) {
      container.appendChild(
        el('div', { className: 'banner banner-info mt-4' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: '🔑 Pickup Code dari Seller' }),
            el('p', { className: 'banner__desc', text: 'Minta code ini ke seller, lalu masukkan di form di bawah.' }),
          ]),
        ])
      );
    }

    // Actions based on status
    const actions = renderActions(order, courierId, container);
    if (actions) container.appendChild(actions);
  } catch (err) {
    console.error('[courier order detail] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat order', desc: err.message }));
  }
}

function renderActions(order, courierId, container) {
  const actions = el('div', { className: 'mt-4' });

  // COURIER_ASSIGNED → Accept or Reject
  if (order.orderStatus === ORDER_STATUS.COURIER_ASSIGNED) {
    actions.appendChild(
      el('div', { className: 'row gap-2' }, [
        el('button', {
          className: 'btn btn-primary btn-block',
          text: '✓ Terima Order',
          onClick: async () => {
            try {
              await courierAcceptOrder(order.id, courierId);
              toast.success('Order diterima! Silakan menuju toko untuk pickup.');
              loadOrder(container, order.id, courierId);
            } catch (err) { toast.error(err.message); }
          },
        }),
        el('button', {
          className: 'btn btn-secondary',
          text: 'Tolak',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Tolak order?',
              message: 'Order akan dialihkan ke kurir lain.',
              confirmLabel: 'Ya, tolak',
              cancelLabel: 'Batal',
              danger: true,
            });
            if (!ok) return;
            try {
              await courierRejectOrder(order.id, courierId, 'Rejected during processing');
              toast.success('Order ditolak.');
              navigate('/courier/orders');
            } catch (err) { toast.error(err.message); }
          },
        }),
      ])
    );
  }

  // COURIER_GOING_TO_PICKUP → Verify pickup code
  if (order.orderStatus === ORDER_STATUS.COURIER_GOING_TO_PICKUP) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-primary btn-block',
        text: '🔑 Masukkan Pickup Code',
        onClick: () => showPickupCodeModal(order, courierId, container),
      })
    );
  }

  // PICKED_UP → Mark as delivering
  if (order.orderStatus === ORDER_STATUS.PICKED_UP) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-primary btn-block',
        text: 'Mulai Antar ke Pembeli',
        onClick: async () => {
          try {
            await markDelivering(order.id, courierId);
            toast.success('Status: Sedang mengantar ke pembeli.');
            loadOrder(container, order.id, courierId);
          } catch (err) { toast.error(err.message); }
        },
      })
    );
  }

  // DELIVERING → Mark arrived
  if (order.orderStatus === ORDER_STATUS.DELIVERING) {
    actions.appendChild(
      el('button', {
        className: 'btn btn-primary btn-block',
        text: '📍 Sampai di Tujuan',
        onClick: async () => {
          try {
            await markArrived(order.id, courierId);
            toast.success('Status: Sampai tujuan. Tunggu buyer verify OTP.');
            loadOrder(container, order.id, courierId);
          } catch (err) { toast.error(err.message); }
        },
      })
    );
  }

  // ARRIVED → Buyer verifies OTP (show info to courier)
  if (order.orderStatus === ORDER_STATUS.ARRIVED) {
    actions.appendChild(
      el('div', { className: 'banner banner-info' }, [
        el('div', {}, [
          el('h3', { className: 'banner__title', text: '⏳ Menunggu Pembeli' }),
          el('p', { className: 'banner__desc', text: 'Pembeli akan verifikasi OTP yang kamu kasih. Setelah verify, status otomatis berubah ke DELIVERED.' }),
        ]),
      ])
    );
  }

  return actions.children.length > 0 ? actions : null;
}

function showPickupCodeModal(order, courierId, container) {
  let input;
  const modal = showModal({
    title: 'Masukkan Pickup Code',
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: 'Minta 6-digit code dari seller. Setelah verify, kamu bisa mulai antar.' }),
      input = el('input', {
        className: 'input input-lg text-center',
        attrs: {
          type: 'text',
          inputmode: 'numeric',
          maxlength: '6',
          placeholder: '000000',
          autocomplete: 'off',
          pattern: '[0-9]*',
          style: 'font-size: 28px; letter-spacing: 8px; font-weight: 700;',
        },
        listeners: {
          input: (e) => {
            // Only allow digits
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
          },
          keydown: (e) => {
            if (e.key === 'Enter') {
              const code = input.value.trim();
              if (code.length === 6) submit(code);
              else toast.warning('Code harus 6 digit.');
            }
          },
        },
      }),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (close) => close() },
      {
        label: 'Verify',
        variant: 'primary',
        onClick: async (close) => {
          const code = input.value.trim();
          if (code.length !== 6) {
            toast.warning('Code harus 6 digit.');
            return;
          }
          await submit(code);
          close();
        },
      },
    ],
  });

  input?.focus();

  async function submit(code) {
    try {
      const result = await verifyPickupCode(order.id, courierId, code);
      toast.success('Pickup verified! Delivery OTP: ' + result.deliveryOtp);
      modal?.();
      loadOrder(container, order.id, courierId);
    } catch (err) {
      toast.error(err.message);
    }
  }
}

async function handleLogout() {
  try {
    await logout();
    toast.success('Berhasil keluar.');
    navigate('/login');
  } catch (err) { toast.error('Gagal keluar.'); }
}
