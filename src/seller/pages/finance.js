// ============================================
// TokoWarung — Seller Finance Page (Phase 3)
// Wallet display + pending/available balance + request withdrawal + history
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { getSellerWallet, requestWithdrawal, listWithdrawals } from '../../services/walletService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';

export default async function SellerFinancePage({ user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller/finance');
    return el('div');
  }

  const page = el('div', { className: 'dashboard' });
  page.appendChild(renderSidebar());

  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Keuangan' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'dashboard__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadWallet(content, user.uid);

  return page;
}

async function loadWallet(container, uid) {
  try {
    const wallet = await getSellerWallet(uid);
    const { items: withdrawals } = await listWithdrawals(uid, { pageSize: 10 });

    container.replaceChildren();

    // Stats grid
    container.appendChild(
      el('div', { className: 'stats-grid' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'Saldo Tersedia' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.pendingBalance || 0) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Total Penarikan' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.withdrawnTotal || 0) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Komisi Platform' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.commissionTotal || 0) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Refund Total' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.refundTotal || 0) }),
        ]),
      ])
    );

    // Withdrawal CTA
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '💸 Tarik Saldo' }),
        el('p', { className: 'text-sm text-muted mb-4', text: 'Saldo minimum untuk withdrawal: Rp 50.000. Withdrawal diproses manual oleh admin dalam 1-3 hari kerja.' }),
        el('button', {
          className: 'btn btn-primary btn-block',
          text: 'Ajukan Penarikan',
          disabled: !wallet.pendingBalance || wallet.pendingBalance < 50000,
          onClick: () => showWithdrawModal(wallet, uid, container),
        }),
        !wallet.pendingBalance || wallet.pendingBalance < 50000
          ? el('p', { className: 'text-xs text-muted text-center mt-2', text: 'Saldo belum cukup untuk withdrawal (minimum Rp 50.000)' })
          : null,
      ])
    );

    // Withdrawal history
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: 'Riwayat Penarikan' }),
        withdrawals.length === 0
          ? EmptyState({ icon: '💸', title: 'Belum ada penarikan', desc: 'Riwayat withdrawal akan tampil di sini.' })
          : el('div', { className: 'withdrawal-list' }, withdrawals.map(renderWithdrawalRow)),
      ])
    );

    // Wallet history (last 20 entries)
    const history = (wallet.history || []).slice(-20).reverse();
    if (history.length > 0) {
      container.appendChild(
        el('div', { className: 'card mt-4' }, [
          el('h2', { className: 'mb-4', text: 'Riwayat Transaksi' }),
          el('div', { className: 'withdrawal-list' }, history.map(renderHistoryRow)),
        ])
      );
    }
  } catch (err) {
    console.error('[seller finance] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat wallet', desc: err.message }));
  }
}

function renderWithdrawalRow(w) {
  const statusColor = w.status === 'COMPLETED' ? 'success' : w.status === 'REJECTED' ? 'danger' : 'warning';
  return el('div', { className: 'product-row' }, [
    el('div', { className: 'product-row__content' }, [
      el('h3', { className: 'product-row__name', text: formatRupiah(w.amount) }),
      el('p', { className: 'text-xs text-muted', text: `${w.bankInfo?.bank || '-'} • ${w.bankInfo?.accountNumber || '-'}` }),
      el('p', { className: 'text-xs text-muted', text: formatDate(w.requestedAt) }),
    ]),
    el('span', { className: 'badge badge-' + statusColor, text: w.status }),
  ]);
}

function renderHistoryRow(h) {
  const isPositive = (h.amount || 0) >= 0;
  return el('div', { className: 'product-row' }, [
    el('div', { className: 'product-row__content' }, [
      el('h3', { className: 'product-row__name', text: h.type.replace(/_/g, ' ') }),
      el('p', { className: 'text-xs text-muted', text: h.note || '' }),
      el('p', { className: 'text-xs text-muted', text: formatDate(h.at) }),
    ]),
    el('span', { className: 'fw-700 ' + (isPositive ? 'text-success' : 'text-danger'), text: (isPositive ? '+' : '') + formatRupiah(h.amount) }),
  ]);
}

function showWithdrawModal(wallet, uid, container) {
  let amountInput, bankInput, accountInput, holderInput;

  const close = showModal({
    title: 'Ajukan Penarikan Saldo',
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: `Saldo tersedia: ${formatRupiah(wallet.pendingBalance)}` }),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Jumlah Penarikan (Rp)', attrs: { for: 'amount' } }),
        amountInput = el('input', {
          className: 'input input-lg',
          attrs: { id: 'amount', type: 'number', min: '50000', max: String(wallet.pendingBalance), placeholder: '50000', inputmode: 'numeric' },
        }),
        el('button', {
          className: 'btn btn-secondary btn-sm mt-2',
          text: 'Tarik Semua',
          onClick: () => { amountInput.value = wallet.pendingBalance; },
        }),
      ]),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Bank', attrs: { for: 'bank' } }),
        bankInput = el('input', {
          className: 'input',
          attrs: { id: 'bank', type: 'text', placeholder: 'BCA, Mandiri, BNI, dll', required: '' },
        }),
      ]),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Nomor Rekening', attrs: { for: 'account' } }),
        accountInput = el('input', {
          className: 'input',
          attrs: { id: 'account', type: 'text', inputmode: 'numeric', placeholder: '1234567890', required: '' },
        }),
      ]),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Nama Pemilik Rekening', attrs: { for: 'holder' } }),
        holderInput = el('input', {
          className: 'input',
          attrs: { id: 'holder', type: 'text', placeholder: 'Sesuai buku tabungan', required: '' },
        }),
      ]),
      el('p', { className: 'text-xs text-muted', text: 'Dengan ajukan penarikan, kamu menyetujui saldo akan dikurangi. Admin akan verifikasi dan transfer dalam 1-3 hari kerja.' }),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Ajukan',
        variant: 'primary',
        onClick: async (c) => {
          const amount = parseInt(amountInput.value, 10);
          const bank = bankInput.value.trim();
          const accountNumber = accountInput.value.trim();
          const holderName = holderInput.value.trim();
          if (!amount || amount < 50000) return toast.error('Minimum withdrawal Rp 50.000.');
          if (!bank || !accountNumber || !holderName) return toast.error('Data bank wajib dilengkapi.');

          try {
            await requestWithdrawal(uid, 'SELLER', amount, { bank, accountNumber, holderName });
            toast.success('Penarikan diajukan! Admin akan proses dalam 1-3 hari kerja.');
            c();
            loadWallet(container, uid);
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
    nav.appendChild(el('a', { className: 'nav-item' + (it.id === 'finance' ? ' is-active' : ''), href: it.href }, [
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
