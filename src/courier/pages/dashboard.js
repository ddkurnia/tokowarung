// ============================================
// TokoWarung — Courier Dashboard
// Functional online/offline toggle (save to Firestore realtime).
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { navigate } from '../../router/router.js';
import { ROLE, COURIER_STATUS } from '../../utils/constants.js';
import { formatRupiah } from '../../utils/helpers.js';
import { subscribeToCourierProfile, setOnline } from '../../services/courierService.js';

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

  // Online toggle card
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
      el('button', { className: 'btn btn-primary', html: '📦 Pesanan Saya', onClick: () => navigate('/courier/orders') }),
      el('button', { className: 'btn btn-secondary', html: '💵 Wallet', onClick: () => navigate('/courier/wallet') }),
      el('button', { className: 'btn btn-secondary', html: '📜 Riwayat Order', onClick: () => navigate('/courier/history') }),
      el('button', { className: 'btn btn-secondary', html: '🆘 Support', onClick: () => navigate('/courier/support') }),
    ])
  );

  page.appendChild(main);

  // Subscribe to courier profile untuk realtime update online status
  const unsub = subscribeToCourierProfile(user.uid, (courierProfile) => {
    renderOnlineCard(onlineCard, courierProfile, user.uid);
  });

  // Cleanup when navigating away (best-effort; for SPA without route hooks, we accept potential double-subscription)
  // TODO: integrate with router for proper cleanup
  setTimeout(() => {
    const observer = new MutationObserver(() => {
      if (!document.body.contains(onlineCard)) {
        unsub();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, 100);

  return page;
}

function renderOnlineCard(container, courierProfile, courierId) {
  if (!courierProfile) {
    // No profile yet — show info + link ke settings
    container.replaceChildren(
      el('div', { className: 'banner banner-warning' }, [
        el('div', {}, [
          el('h3', { className: 'banner__title', text: 'Profil kurir belum lengkap' }),
          el('p', { className: 'banner__desc', text: 'Lengkapi data diri & dokumen untuk mulai menerima order. Admin akan verify dalam 1x24 jam.' }),
        ]),
        el('button', { className: 'btn btn-primary btn-sm', text: 'Lengkapi profil', onClick: () => toast.info('Halaman verifikasi kurir akan tersedia segera. Untuk testing, minta admin verify via Firebase Console.') }),
      ])
    );
    return;
  }

  // If pending verification, show banner TAPI tetap tampilkan stats & info
  if (courierProfile.status === 'PENDING_VERIFICATION') {
    container.replaceChildren(
      el('div', { className: 'banner banner-warning' }, [
        el('div', {}, [
          el('h3', { className: 'banner__title', text: 'Akun dalam proses verifikasi' }),
          el('p', { className: 'banner__desc', text: 'Tunggu admin memverifikasi akunmu. Proses biasanya 1x24 jam. Untuk testing cepat, admin bisa set status ke VERIFIED di Firebase Console → couriers/' + courierId.slice(0, 8) + '...' }),
        ]),
      ]),
      el('div', { className: 'online-card' }, [
        el('div', { className: 'online-card__status' }, [
          el('div', { className: 'online-card__indicator' }),
          el('div', {}, [
            el('h2', { className: 'online-card__title', text: 'Status: Belum Verified' }),
            el('p', { className: 'text-sm text-muted', text: 'Setelah verified, kamu bisa mulai online & menerima order.' }),
          ]),
        ]),
      ])
    );
    return;
  }

  if (courierProfile.status === 'SUSPENDED') {
    container.replaceChildren(
      el('div', { className: 'banner banner-warning' }, [
        el('div', {}, [
          el('h3', { className: 'banner__title', text: 'Akun ditangguhkan' }),
          el('p', { className: 'banner__desc', text: 'Hubungi admin untuk informasi lebih lanjut.' }),
        ]),
      ])
    );
    return;
  }

  const isOnline = courierProfile.isOnline;
  const currentStatus = courierProfile.status;
  const canToggle = [COURIER_STATUS.OFFLINE, COURIER_STATUS.ONLINE_AVAILABLE].includes(currentStatus);

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
        disabled: !canToggle,
        onClick: async (e) => {
          const btn = e.target;
          btn.disabled = true;
          btn.textContent = 'Memproses...';
          try {
            // Try to get geolocation (best-effort)
            let location = null;
            if (!isOnline && navigator.geolocation) {
              try {
                location = await new Promise((resolve) => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => resolve(null),
                    { timeout: 5000, enableHighAccuracy: false }
                  );
                });
              } catch (geoErr) {
                console.warn('[courier] Geolocation failed:', geoErr);
              }
            }
            await setOnline(courierId, !isOnline, location);
            toast.success(isOnline ? 'Kamu sekarang offline.' : 'Kamu sekarang online. Menunggu order...');
          } catch (err) {
            console.error('[courier] toggle online error:', err);
            toast.error(err.message || 'Gagal mengubah status online.');
            btn.disabled = false;
            btn.textContent = isOnline ? 'Matikan Online' : 'Mulai Online';
          }
        },
      }),
      !canToggle ? el('p', { className: 'text-xs text-muted text-center mt-2', text: `Status: ${currentStatus}. Tidak bisa toggle saat ini.` }) : null,
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
