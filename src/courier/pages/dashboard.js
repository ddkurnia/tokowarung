// ============================================
// TokoWarung — Courier Dashboard
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { navigate } from '../../router/router.js';
import { ROLE, COURIER_STATUS } from '../../utils/constants.js';
import { formatRupiah } from '../../utils/helpers.js';

export default async function CourierDashboard({ user, profile }) {
  if (profile?.role !== ROLE.COURIER) {
    navigate('/login?redirect=/courier');
    return el('div');
  }

  const page = el('div', { className: 'dashboard dashboard--courier' });

  // Top bar
  page.appendChild(
    el('header', { className: 'dashboard__topbar' }, [
      el('div', { className: 'row' }, [
        el('h1', { className: 'dashboard__title', text: 'Dashboard Kurir' }),
      ]),
      el('div', { className: 'row gap-2' }, [
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  const main = el('main', { className: 'dashboard__content container' });

  // Online toggle (large, prominent — most-used action)
  const onlineCard = el('div', { className: 'card card-elevated', id: 'onlineCard' });
  onlineCard.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(onlineCard);

  // Stats grid
  main.appendChild(
    el('div', { className: 'stats-grid stats-grid--courier mt-4' }, [
      el('div', { className: 'stat-card stat-card--success' }, [
        el('p', { className: 'stat-card__label', text: 'Pendapatan Hari Ini' }),
        el('p', { className: 'stat-card__value', text: formatRupiah(0) }),
      ]),
      el('div', { className: 'stat-card stat-card--info' }, [
        el('p', { className: 'stat-card__label', text: 'COD Diterima' }),
        el('p', { className: 'stat-card__value', text: formatRupiah(0) }),
      ]),
      el('div', { className: 'stat-card stat-card--warning' }, [
        el('p', { className: 'stat-card__label', text: 'COD Belum Disetor' }),
        el('p', { className: 'stat-card__value', text: formatRupiah(0) }),
      ]),
      el('div', { className: 'stat-card stat-card--primary' }, [
        el('p', { className: 'stat-card__label', text: 'Rating' }),
        el('p', { className: 'stat-card__value', text: '—' }),
      ]),
    ])
  );

  // Active order placeholder
  main.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('h2', { className: 'mb-4', text: 'Order Aktif' }),
      EmptyState({ icon: '🛵', title: 'Belum ada order aktif', desc: 'Saat ada order masuk, akan muncul di sini.' }),
    ])
  );

  // Quick links
  main.appendChild(
    el('div', { className: 'quick-actions mt-4' }, [
      el('button', { className: 'btn btn-secondary', html: '💵 Wallet', onClick: () => navigate('/courier/wallet') }),
      el('button', { className: 'btn btn-secondary', html: '📜 Riwayat Order', onClick: () => navigate('/courier/history') }),
      el('button', { className: 'btn btn-secondary', html: '🆘 Support', onClick: () => navigate('/courier/support') }),
    ])
  );

  page.appendChild(main);

  // Load online card
  loadOnlineCard(onlineCard, user.uid);

  return page;
}

async function loadOnlineCard(container, courierId) {
  // TODO: load courier's isOnline status from Firestore
  const isOnline = false;
  container.replaceChildren(
    el('div', { className: 'online-card' }, [
      el('div', { className: 'online-card__status' }, [
        el('div', { className: 'online-card__indicator' + (isOnline ? ' is-online' : '') }),
        el('div', {}, [
          el('h2', { className: 'online-card__title', text: isOnline ? 'Kamu sedang Online' : 'Kamu sedang Offline' }),
          el('p', { className: 'text-sm text-muted', text: isOnline ? 'Sistem akan mengirim order kepadamu.' : 'Aktifkan untuk mulai menerima order.' }),
        ]),
      ]),
      el('button', {
        className: 'btn ' + (isOnline ? 'btn-danger' : 'btn-success') + ' btn-lg btn-block',
        text: isOnline ? 'Matikan Online' : 'Mulai Online',
        onClick: async (e) => {
          // TODO: call courierService.setOnline(courierId, !isOnline)
          toast.info('Fitur online/offline akan diaktifkan setelah verifikasi kurir selesai.');
        },
      }),
    ])
  );
}

async function handleLogout() {
  try {
    await logout();
    toast.success('Berhasil keluar.');
    navigate('/login');
  } catch (err) {
    toast.error('Gagal keluar. Coba lagi.');
  }
}
