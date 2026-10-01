// ============================================
// TokoWarung — Courier Wallet Page (Phase 3)
// Earnings + COD collected/outstanding/settled + withdrawal
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { getCourierWallet, requestWithdrawal, listWithdrawals } from '../../services/walletService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';

export default async function CourierWalletPage({ user, profile }) {
  if (profile?.role !== ROLE.COURIER) {
    navigate('/login?redirect=/courier/wallet');
    return el('div');
  }

  const page = el('div', { className: 'dashboard dashboard--courier' });

  page.appendChild(
    el('header', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Wallet' }),
      el('div', { className: 'row gap-2' }, [
        el('button', { className: 'btn btn-ghost btn-sm', html: '← Dashboard', onClick: () => navigate('/courier') }),
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  const main = el('main', { className: 'dashboard__content container' });
  const content = el('div', { className: 'wallet-content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadWallet(content, user.uid);

  return page;
}

async function loadWallet(container, uid) {
  try {
    const wallet = await getCourierWallet(uid);
    const { items: withdrawals } = await listWithdrawals(uid, { pageSize: 10 });

    container.replaceChildren();

    // Stats grid
    container.appendChild(
      el('div', { className: 'stats-grid' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'Penghasilan' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.earnings || 0) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'COD Diterima' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.codCollected || 0) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'COD Belum Disetor' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.codOutstanding || 0) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Total Ditarik' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(wallet.withdrawnTotal || 0) }),
        ]),
      ])
    );

    // COD info banner
    if ((wallet.codOutstanding || 0) > 0) {
      container.appendChild(
        el('div', { className: 'banner banner-warning mt-4' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: '⚠️ Setor COD ke Admin' }),
            el('p', { className: 'banner__desc', text: `Kamu pegang ${formatRupiah(wallet.codOutstanding)} dari COD order. Hubungi admin untuk setor dan update saldo.` }),
          ]),
        ])
      );
    }

    // Withdrawal CTA
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: '💸 Tarik Penghasilan' }),
        el('p', { className: 'text-sm text-muted mb-4', text: 'Minimum withdrawal Rp 50.000. Diproses 1-3 hari kerja.' }),
        el('button', {
          className: 'btn btn-primary btn-block',
          text: 'Ajukan Penarikan',
          disabled: !wallet.earnings || wallet.earnings < 50000,
          onClick: () => showWithdrawModal(wallet, uid, container),
        }),
      ])
    );

    // Withdrawal history
    container.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: 'Riwayat Penarikan' }),
        withdrawals.length === 0
          ? EmptyState({ icon: '💸', title: 'Belum ada penarikan' })
          : el('div', { className: 'withdrawal-list' }, withdrawals.map(renderWithdrawalRow)),
      ])
    );

    // Wallet history
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
    console.error('[courier wallet] load error:', err);
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

  showModal({
    title: 'Ajukan Penarikan Penghasilan',
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: `Penghasilan tersedia: ${formatRupiah(wallet.earnings)}` }),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Jumlah (Rp)' }),
        amountInput = el('input', {
          className: 'input input-lg',
          attrs: { type: 'number', min: '50000', max: String(wallet.earnings), placeholder: '50000', inputmode: 'numeric' },
        }),
        el('button', {
          className: 'btn btn-secondary btn-sm mt-2',
          text: 'Tarik Semua',
          onClick: () => { amountInput.value = wallet.earnings; },
        }),
      ]),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Bank' }),
        bankInput = el('input', { className: 'input', attrs: { type: 'text', placeholder: 'BCA, Mandiri, dll', required: '' } }),
      ]),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Nomor Rekening' }),
        accountInput = el('input', { className: 'input', attrs: { type: 'text', inputmode: 'numeric', placeholder: '1234567890', required: '' } }),
      ]),
      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Nama Pemilik Rekening' }),
        holderInput = el('input', { className: 'input', attrs: { type: 'text', placeholder: 'Sesuai buku tabungan', required: '' } }),
      ]),
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
            await requestWithdrawal(uid, 'COURIER', amount, { bank, accountNumber, holderName });
            toast.success('Penarikan diajukan!');
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

async function handleLogout() {
  try {
    await logout();
    toast.success('Berhasil keluar.');
    navigate('/login');
  } catch (err) { toast.error('Gagal keluar.'); }
}
