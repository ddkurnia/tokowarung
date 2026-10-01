// ============================================
// TokoWarung — Seller Voucher Management (Phase 5.5)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listSellerVouchers, createVoucher, deactivateVoucher } from '../../services/promotionService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';

export default async function SellerVouchersPage({ user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller/vouchers');
    return el('div');
  }

  const page = el('div', { className: 'dashboard' });
  page.appendChild(renderSidebar());

  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Voucher & Promo' }),
      el('div', { className: 'row gap-2' }, [
        el('button', {
          className: 'btn btn-primary btn-sm',
          text: '+ Buat Voucher',
          onClick: () => showCreateModal(user.uid, main),
        }),
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  const content = el('div', { className: 'dashboard__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadVouchers(content, user.uid);

  return page;
}

async function loadVouchers(container, sellerId) {
  try {
    const { items } = await listSellerVouchers(sellerId);

    container.replaceChildren();

    // Stats
    const active = items.filter((v) => v.isActive && new Date(v.endDate?.toDate ? v.endDate.toDate() : v.endDate) > new Date());
    const expired = items.filter((v) => new Date(v.endDate?.toDate ? v.endDate.toDate() : v.endDate) < new Date());
    const usedOut = items.filter((v) => v.maxUsage && (v.usedCount || 0) >= v.maxUsage);

    container.appendChild(
      el('div', { className: 'stats-grid mb-6' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'Total Voucher' }),
          el('p', { className: 'stat-card__value', text: String(items.length) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Aktif' }),
          el('p', { className: 'stat-card__value', text: String(active.length) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Expired' }),
          el('p', { className: 'stat-card__value', text: String(expired.length) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Total Dipakai' }),
          el('p', { className: 'stat-card__value', text: String(items.reduce((s, v) => s + (v.usedCount || 0), 0)) }),
        ]),
      ])
    );

    if (items.length === 0) {
      container.appendChild(
        EmptyState({
          icon: '🎟️',
          title: 'Belum ada voucher',
          desc: 'Buat voucher pertamamu untuk menarik buyer. Misal: HEMAT10 untuk diskon 10%.',
        })
      );
      return;
    }

    items.forEach((v) => container.appendChild(renderVoucherCard(v, sellerId, container)));
  } catch (err) {
    console.error('[seller vouchers] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat voucher', desc: err.message }));
  }
}

function renderVoucherCard(v, sellerId, container) {
  const now = new Date();
  const endDate = v.endDate?.toDate ? v.endDate.toDate() : new Date(v.endDate);
  const isExpired = endDate < now;
  const isUsedOut = v.maxUsage && (v.usedCount || 0) >= v.maxUsage;
  const status = !v.isActive ? 'Nonaktif' : isExpired ? 'Expired' : isUsedOut ? 'Habis' : 'Aktif';
  const statusColor = !v.isActive ? 'info' : isExpired ? 'info' : isUsedOut ? 'warning' : 'success';

  const discountLabel = v.discountType === 'PERCENT'
    ? `${v.discountValue}% off`
    : v.discountType === 'FLAT'
    ? formatRupiah(v.discountValue) + ' off'
    : 'FREE Shipping';

  return el('div', { className: 'card voucher-card mb-4' }, [
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'fw-800 text-lg', text: v.code }),
        el('p', { className: 'text-sm text-success', text: discountLabel }),
        v.maxDiscount ? el('p', { className: 'text-xs text-muted', text: `Maks diskon: ${formatRupiah(v.maxDiscount)}` }) : null,
        v.minPurchase ? el('p', { className: 'text-xs text-muted', text: `Min belanja: ${formatRupiah(v.minPurchase)}` }) : null,
      ]),
      el('span', { className: 'badge badge-' + statusColor, text: status }),
    ]),
    el('div', { className: 'row-between text-xs text-muted' }, [
      el('span', { text: `${formatDate(v.startDate?.toDate ? v.startDate.toDate() : v.startDate)} → ${formatDate(endDate)}` }),
      el('span', { text: `${v.usedCount || 0}/${v.maxUsage || '∞'} dipakai` }),
    ]),
    v.description ? el('p', { className: 'text-sm mt-2', text: v.description }) : null,
    el('div', { className: 'row gap-2 mt-3' }, [
      v.isActive && !isExpired && !isUsedOut
        ? el('button', {
            className: 'btn btn-danger btn-sm',
            text: 'Deactivate',
            onClick: async () => {
              try {
                await deactivateVoucher(v.id, sellerId);
                toast.success('Voucher dinonaktifkan.');
                loadVouchers(container, sellerId);
              } catch (err) { toast.error(err.message); }
            },
          })
        : null,
    ]),
  ]);
}

function showCreateModal(sellerId, container) {
  let codeInput, discountTypeSelect, valueInput, maxDiscountInput, minPurchaseInput, startDateInput, endDateInput, maxUsageInput, maxPerUserInput, descriptionInput;

  showModal({
    title: 'Buat Voucher Baru',
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: 'Voucher untuk toko kamu. Buyer bisa pakai di checkout.' }),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Kode Voucher (4-20 huruf/angka)' }),
        codeInput = el('input', { className: 'input', attrs: { type: 'text', placeholder: 'HEMAT10', maxlength: '20', required: '' } }),
        el('p', { className: 'field-hint', text: 'Huruf besar + angka, 4-20 karakter' }),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Tipe Diskon' }),
        discountTypeSelect = el('select', { className: 'select' }, [
          el('option', { attrs: { value: 'PERCENT' } }, ['Persentase (%)']),
          el('option', { attrs: { value: 'FLAT' } }, ['Nominal (Rp)']),
          el('option', { attrs: { value: 'FREE_SHIPPING' } }, ['Free Ongkir']),
        ]),
      ]),

      el('div', { className: 'field mb-4', id: 'valueField' }, [
        el('label', { className: 'field-label', text: 'Nilai Diskon' }),
        valueInput = el('input', { className: 'input', attrs: { type: 'number', placeholder: '10 (untuk 10%) atau 5000 (untuk Rp 5.000)', min: '1' } }),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Maks Diskon (Rp, opsional - untuk PERCENT)' }),
        maxDiscountInput = el('input', { className: 'input', attrs: { type: 'number', placeholder: '50000', min: '0' } }),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Min Belanja (Rp, opsional)' }),
        minPurchaseInput = el('input', { className: 'input', attrs: { type: 'number', placeholder: '50000', min: '0' } }),
      ]),

      el('div', { className: 'checkout-form-grid' }, [
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Mulai' }),
          startDateInput = el('input', { className: 'input', attrs: { type: 'date', required: '' } }),
        ]),
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Berakhir' }),
          endDateInput = el('input', { className: 'input', attrs: { type: 'date', required: '' } }),
        ]),
      ]),

      el('div', { className: 'checkout-form-grid' }, [
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Maks Total Pemakaian (opsional)' }),
          maxUsageInput = el('input', { className: 'input', attrs: { type: 'number', placeholder: '100', min: '1' } }),
        ]),
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Maks Per User' }),
          maxPerUserInput = el('input', { className: 'input', attrs: { type: 'number', value: '1', min: '1' } }),
        ]),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Deskripsi (opsional)' }),
        descriptionInput = el('input', { className: 'input', attrs: { type: 'text', placeholder: 'Diskon spesial untuk pembeli pertama!' } }),
      ]),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Buat Voucher',
        variant: 'primary',
        onClick: async (c) => {
          const code = codeInput.value.trim();
          const discountType = discountTypeSelect.value;
          const discountValue = parseInt(valueInput.value, 10);
          const maxDiscount = maxDiscountInput.value ? parseInt(maxDiscountInput.value, 10) : null;
          const minPurchase = minPurchaseInput.value ? parseInt(minPurchaseInput.value, 10) : 0;
          const startDate = startDateInput.value;
          const endDate = endDateInput.value;
          const maxUsage = maxUsageInput.value ? parseInt(maxUsageInput.value, 10) : null;
          const maxUsagePerUser = parseInt(maxPerUserInput.value || '1', 10);
          const description = descriptionInput.value.trim();

          if (!code) return toast.error('Code wajib diisi.');
          if (discountType !== 'FREE_SHIPPING' && (!discountValue || discountValue < 1)) return toast.error('Nilai diskon wajib & > 0.');
          if (!startDate || !endDate) return toast.error('Tanggal mulai & akhir wajib.');

          try {
            await createVoucher({
              code, ownerType: 'SELLER', ownerId: sellerId,
              discountType, discountValue: discountType === 'FREE_SHIPPING' ? 0 : discountValue,
              maxDiscount, minPurchase,
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate + 'T23:59:59').toISOString(),
              maxUsage, maxUsagePerUser,
              sellerIdScope: sellerId, // Voucher hanya berlaku di toko ini
              description,
            });
            toast.success(`Voucher "${code.toUpperCase()}" berhasil dibuat!`);
            c();
            loadVouchers(container, sellerId);
          } catch (err) {
            toast.error(err.message);
          }
        },
      },
    ],
  });
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
    nav.appendChild(el('a', { className: 'nav-item' + (it.id === 'vouchers' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  return nav;
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
