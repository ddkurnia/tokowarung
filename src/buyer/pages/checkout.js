// ============================================
// TokoWarung — Buyer Checkout Page
// Shipping address + payment method + order summary → create order per seller
// ============================================

import { el, EmptyState, BuyerHeader, BuyerBottomNav } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { getCart, groupBySeller, calculateTotals } from '../../services/cartService.js';
import { createOrder } from '../../services/orderService.js';
import { validateVoucher, recordVoucherUsage } from '../../services/promotionService.js';
import { navigate } from '../../router/router.js';
import { formatRupiah } from '../../utils/helpers.js';
import { PAYMENT_METHOD } from '../../utils/constants.js';

const PAYMENT_METHODS = [
  { id: PAYMENT_METHOD.COD, label: 'COD (Bayar di Tempat)', icon: '💵', desc: 'Bayar tunai ke kurir saat barang sampai' },
  { id: PAYMENT_METHOD.QRIS, label: 'QRIS', icon: '📱', desc: 'Scan QR code untuk bayar instan' },
  { id: PAYMENT_METHOD.VA, label: 'Virtual Account', icon: '🏦', desc: 'Transfer via VA (BCA, Mandiri, BNI, BRI)' },
  { id: PAYMENT_METHOD.EWALLET, label: 'E-Wallet', icon: '👛', desc: 'GoPay, OVO, DANA, ShopeePay' },
];

export default async function CheckoutPage({ user, profile }) {
  const page = el('div', { className: 'buyer-checkout' });

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
      el('h1', { text: 'Checkout' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '← Keranjang', onClick: () => navigate('/cart') }),
    ])
  );
  page.appendChild(main);

  const content = el('div', { className: 'checkout-content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadCheckout(content, user, profile);

  page.appendChild(BuyerBottomNav({ active: 'cart' }));

  return page;
}

async function loadCheckout(container, user, profile) {
  try {
    const items = await getCart(user);

    if (items.length === 0) {
      container.replaceChildren(
        EmptyState({
          icon: '🛒',
          title: 'Keranjang kosong',
          desc: 'Tambahkan produk ke keranjang sebelum checkout.',
          action: el('button', { className: 'btn btn-primary', text: 'Mulai Belanja', onClick: () => navigate('/') }),
        })
      );
      return;
    }

    const sellerGroups = groupBySeller(items);
    const grandSubtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const serviceFee = 1000;
    const shippingFee = 8000; // MVP flat; in Phase 3 compute via distance
    const total = grandSubtotal + serviceFee + shippingFee;

    // Phase 5.5: Voucher state — mutable saat buyer apply voucher
    let voucherState = { code: '', discount: 0, freeShipping: false, voucherId: null, description: '' };

    let selectedPayment = PAYMENT_METHOD.COD;

    // Pre-fill form with profile data
    const defaultName = profile?.displayName || '';
    const defaultPhone = profile?.phone || '';
    const defaultAddress = profile?.address?.fullAddress || '';

    container.replaceChildren();

    // ===== Layout: form (left) + summary (right) =====
    const layout = el('div', { className: 'checkout-layout' });

    // ----- LEFT: form sections -----
    const formCol = el('div', { className: 'checkout-form-col' });

    // 1. Shipping address
    formCol.appendChild(
      el('div', { className: 'card mb-4' }, [
        el('h2', { className: 'mb-4', text: '1. Alamat Pengiriman' }),
        el('div', { className: 'checkout-form-grid' }, [
          el('div', { className: 'field' }, [
            el('label', { className: 'field-label', text: 'Nama Penerima', attrs: { for: 'name' } }),
            el('input', { className: 'input', attrs: { id: 'name', name: 'name', value: defaultName, placeholder: 'Nama lengkap penerima', required: '' } }),
          ]),
          el('div', { className: 'field' }, [
            el('label', { className: 'field-label', text: 'Nomor HP', attrs: { for: 'phone' } }),
            el('input', { className: 'input', attrs: { id: 'phone', name: 'phone', type: 'tel', value: defaultPhone, placeholder: '08xxxxxxxxxx', required: '' } }),
          ]),
        ]),
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Alamat Lengkap', attrs: { for: 'address' } }),
          el('textarea', { className: 'textarea', attrs: { id: 'address', name: 'address', placeholder: 'Jalan, RT/RW, kelurahan, kota, kode pos', required: '', rows: '3' } }, [defaultAddress]),
        ]),
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Patokan / Catatan (opsional)', attrs: { for: 'note' } }),
          el('input', { className: 'input', attrs: { id: 'note', name: 'note', placeholder: 'Contoh: depan masjid, pintu hijau' } }),
        ]),
      ])
    );

    // 2. Payment method
    formCol.appendChild(
      el('div', { className: 'card mb-4' }, [
        el('h2', { className: 'mb-4', text: '2. Metode Pembayaran' }),
        el('div', { className: 'payment-methods', id: 'paymentMethods' }, PAYMENT_METHODS.map((m) => {
          const card = el('label', {
            className: 'payment-method' + (m.id === selectedPayment ? ' is-selected' : ''),
            attrs: { 'data-method': m.id },
          }, [
            el('input', {
              attrs: { type: 'radio', name: 'payment', value: m.id, checked: m.id === selectedPayment ? '' : null },
              style: { display: 'none' },
              listeners: { change: () => selectPayment(m.id) },
            }),
            el('div', { className: 'payment-method__icon', html: m.icon }),
            el('div', { className: 'payment-method__content' }, [
              el('p', { className: 'payment-method__label fw-600', text: m.label }),
              el('p', { className: 'payment-method__desc text-xs text-muted', text: m.desc }),
            ]),
            el('div', { className: 'payment-method__check', html: '✓' }),
          ]);
          return card;
        })),
      ])
    );

    // 3. Items per seller (review)
    formCol.appendChild(
      el('div', { className: 'card mb-4' }, [
        el('h2', { className: 'mb-4', text: '3. Review Pesanan' }),
        ...sellerGroups.map((group) => {
          const { subtotal } = calculateTotals(group);
          return el('div', { className: 'checkout-seller-group' }, [
            el('div', { className: 'checkout-seller-group__header' }, [
              el('div', { className: 'avatar', text: (group.sellerName || 'T').charAt(0).toUpperCase() }),
              el('h3', { className: 'fw-600', text: group.sellerName || 'Toko' }),
            ]),
            ...group.items.map((it) =>
              el('div', { className: 'checkout-item-row' }, [
                el('div', { className: 'checkout-item-row__img' }, it.image ? el('img', { attrs: { src: it.image, alt: it.name, loading: 'lazy' } }) : el('span', { html: '🖼️' })),
                el('div', { className: 'checkout-item-row__content' }, [
                  el('p', { className: 'checkout-item-row__name', text: it.name }),
                  el('p', { className: 'text-xs text-muted', text: `${it.qty} × ${formatRupiah(it.price)}` }),
                ]),
                el('p', { className: 'fw-600', text: formatRupiah(it.price * it.qty) }),
              ])
            ),
            el('div', { className: 'checkout-seller-group__subtotal' }, [
              el('span', { className: 'text-sm text-muted', text: 'Subtotal + ongkir' }),
              el('span', { className: 'fw-700', text: formatRupiah(subtotal + shippingFee / sellerGroups.length) }),
            ]),
          ]);
        }),
      ])
    );

    layout.appendChild(formCol);

    // ----- RIGHT: order summary (sticky) -----
    const summaryCol = el('div', { className: 'checkout-summary-col' });
    summaryCol.appendChild(renderSummarySection());

    function computeFinalTotal() {
      const effectiveShipping = voucherState.freeShipping ? 0 : shippingFee;
      return grandSubtotal + serviceFee + effectiveShipping - voucherState.discount;
    }

    function renderSummarySection() {
      const finalTotal = computeFinalTotal();
      const effectiveShipping = voucherState.freeShipping ? 0 : shippingFee;
      return el('div', { className: 'card card-elevated checkout-summary' }, [
        el('h2', { className: 'mb-4', text: 'Ringkasan Pembayaran' }),
        el('div', { className: 'summary-row' }, [
          el('span', { className: 'text-sm text-muted', text: 'Subtotal produk' }),
          el('span', { className: 'fw-600', text: formatRupiah(grandSubtotal) }),
        ]),
        el('div', { className: 'summary-row' }, [
          el('span', { className: 'text-sm text-muted', text: 'Biaya layanan' }),
          el('span', { className: 'fw-600', text: formatRupiah(serviceFee) }),
        ]),
        el('div', { className: 'summary-row' }, [
          el('span', { className: 'text-sm text-muted', text: voucherState.freeShipping ? 'Ongkir (FREE 🎉)' : 'Ongkir (estimasi)' }),
          el('span', { className: 'fw-600 ' + (voucherState.freeShipping ? 'text-success' : ''), text: voucherState.freeShipping ? formatRupiah(0) : formatRupiah(shippingFee) }),
        ]),
        voucherState.discount > 0
          ? el('div', { className: 'summary-row' }, [
              el('span', { className: 'text-sm text-success', text: `Voucher ${voucherState.code}` }),
              el('span', { className: 'fw-600 text-success', text: '-' + formatRupiah(voucherState.discount) }),
            ])
          : null,
        el('div', { className: 'summary-divider' }),
        el('div', { className: 'summary-row summary-row--total' }, [
          el('span', { text: 'Total Bayar' }),
          el('span', { className: 'fw-800 text-xl text-success', text: formatRupiah(finalTotal) }),
        ]),
        // Voucher input
        el('div', { className: 'voucher-input-row mt-4' }, [
          el('input', {
            className: 'input',
            id: 'voucherInput',
            attrs: { type: 'text', placeholder: 'Kode voucher (cth: HEMAT50)', autocomplete: 'off' },
          }),
          el('button', {
            className: 'btn btn-secondary',
            text: 'Apply',
            onClick: async () => {
              const code = container.querySelector('#voucherInput').value.trim();
              if (!code) {
                toast.error('Masukkan kode voucher dulu.');
                return;
              }
              try {
                // Use first seller for scope check (kalau voucher scope-specific)
                const firstSellerId = sellerGroups[0]?.sellerId;
                const result = await validateVoucher(code, user.uid, grandSubtotal, shippingFee, firstSellerId);
                voucherState = {
                  code: result.code,
                  discount: result.discountAmount,
                  freeShipping: result.freeShipping,
                  voucherId: result.voucherId,
                  description: result.description || '',
                };
                toast.success(`Voucher "${result.code}" diterapkan! ${result.freeShipping ? 'Free shipping!' : 'Diskon ' + formatRupiah(result.discountAmount)}`);
                reRenderSummary();
              } catch (err) {
                console.error('[voucher] apply error:', err);
                toast.error(err.message || 'Voucher tidak valid.');
                voucherState = { code: '', discount: 0, freeShipping: false, voucherId: null, description: '' };
                reRenderSummary();
              }
            },
          }),
        ]),
        voucherState.voucherId
          ? el('button', {
              className: 'btn-link text-xs text-muted mt-2',
              text: 'Hapus voucher',
              onClick: () => {
                voucherState = { code: '', discount: 0, freeShipping: false, voucherId: null, description: '' };
                container.querySelector('#voucherInput').value = '';
                toast.info('Voucher dihapus.');
                reRenderSummary();
              },
            })
          : null,
        el('button', {
          className: 'btn btn-primary btn-block btn-lg mt-4',
          id: 'placeOrderBtn',
          text: 'Buat Pesanan',
          onClick: () => handlePlaceOrder({
            user,
            profile,
            sellerGroups,
            shippingFee: voucherState.freeShipping ? 0 : shippingFee,
            serviceFee,
            total: computeFinalTotal(),
            voucher: voucherState.voucherId ? voucherState : null,
            getFormData: () => ({
              name: container.querySelector('#name').value.trim(),
              phone: container.querySelector('#phone').value.trim(),
              address: container.querySelector('#address').value.trim(),
              note: container.querySelector('#note').value.trim(),
            }),
            paymentMethod: selectedPayment,
            content: container,
          }),
        }),
        el('p', { className: 'text-xs text-muted text-center mt-3', text: 'Dengan klik "Buat Pesanan", kamu menyetujui Ketentuan Layanan TokoWarung.' }),
      ]);
    }

    layout.appendChild(summaryCol);

    function reRenderSummary() {
      const oldCard = summaryCol.querySelector('.checkout-summary');
      if (oldCard) oldCard.replaceWith(renderSummarySection());
    }

    container.appendChild(layout);
  } catch (err) {
    console.error('[checkout] load error:', err);
    container.replaceChildren(
      EmptyState({
        icon: '⚠️',
        title: 'Gagal memuat checkout',
        desc: 'Terjadi masalah. Coba muat ulang.',
        action: el('button', { className: 'btn btn-primary', text: 'Muat Ulang', onClick: () => window.location.reload() }),
      })
    );
  }

  function selectPayment(methodId) {
    selectedPayment = methodId;
    container.querySelectorAll('.payment-method').forEach((c) => {
      c.classList.toggle('is-selected', c.dataset.method === methodId);
    });
  }
}

async function handlePlaceOrder({ user, profile, sellerGroups, shippingFee, serviceFee, total, voucher, getFormData, paymentMethod, content }) {
  const { name, phone, address, note } = getFormData();

  // Validate
  if (!name || name.length < 3) return toast.error('Nama penerima minimal 3 karakter.');
  if (!phone) return toast.error('Nomor HP wajib diisi.');
  if (!address || address.length < 10) return toast.error('Alamat lengkap wajib diisi.');

  const btn = content.querySelector('#placeOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Memproses pesanan...';

  try {
    // Create one order per seller (multi-seller checkout splits into multiple orders)
    const shippingAddress = { name, phone, fullAddress: address, note };
    const perSellerShipping = Math.round(shippingFee / sellerGroups.length);

    let lastOrderId = null;
    let orderIds = [];

    for (const group of sellerGroups) {
      const orderItems = group.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        price: it.price,
        qty: it.qty,
        weight: it.weight || 0,
        image: typeof it.image === 'string' ? it.image : it.image?.url || '',
      }));

      // Phase 5.5: pass voucher discount if applied
      const sellerSubtotal = group.items.reduce((s, it) => s + it.price * it.qty, 0);
      let perOrderDiscount = 0;
      if (voucher && voucher.voucherId) {
        // Distribute voucher discount proportionally per seller
        const totalSubtotal = sellerGroups.reduce((s, g) => s + g.items.reduce((ss, it) => ss + it.price * it.qty, 0), 0);
        perOrderDiscount = Math.round((voucher.discount * sellerSubtotal) / totalSubtotal);
      }

      const { orderId } = await createOrder({
        buyerId: user.uid,
        sellerId: group.sellerId,
        items: orderItems,
        shippingAddress,
        shippingFee: perSellerShipping,
        serviceFee: Math.round(serviceFee / sellerGroups.length),
        discount: perOrderDiscount,
        paymentMethod,
      });

      orderIds.push(orderId);
      lastOrderId = orderId;
    }

    // Phase 5.5: Record voucher usage (after all orders created successfully)
    if (voucher && voucher.voucherId) {
      try {
        await recordVoucherUsage(voucher.voucherId, user.uid, lastOrderId, voucher.discount);
      } catch (err) {
        console.warn('[checkout] Failed to record voucher usage:', err);
        // Don't fail order if voucher tracking fails
      }
    }

    // Clear cart after successful order creation
    const { clearCart } = await import('../../services/cartService.js');
    await clearCart(user);

    toast.success(`${orderIds.length} pesanan berhasil dibuat!` + (voucher ? ` Voucher ${voucher.code} diterapkan!` : ''));

    // Navigate to success page with first order id
    navigate('/checkout/success/' + lastOrderId, { orders: orderIds.join(',') });
  } catch (err) {
    console.error('[checkout] place order error:', err);
    toast.error(err.message || 'Gagal membuat pesanan. Coba lagi.');
    btn.disabled = false;
    btn.textContent = 'Buat Pesanan';
  }
}
