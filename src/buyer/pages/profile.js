// ============================================
// TokoWarung — Profile Page (Phase 7 fix)
// ============================================
// Auto-detect role & redirect ke dashboard sesuai role.
// Realtime: subscribe to onAuthChange, update saat profile tersedia.
// ============================================

import { el, BuyerHeader, BuyerBottomNav, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { logout, onAuthChange, getCurrentUser } from '../../auth/authService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatDate, initials } from '../../utils/helpers.js';

const ROLE_LABELS = {
  [ROLE.BUYER]: 'Pembeli',
  [ROLE.SELLER]: 'Penjual / Toko',
  [ROLE.COURIER]: 'Kurir',
  [ROLE.ADMIN]: 'Admin',
  [ROLE.SUPER_ADMIN]: 'Super Admin',
};

const ROLE_DASHBOARD = {
  [ROLE.BUYER]: '/',
  [ROLE.SELLER]: '/seller',
  [ROLE.COURIER]: '/courier',
  [ROLE.ADMIN]: '/admin',
  [ROLE.SUPER_ADMIN]: '/admin',
};

export default async function ProfilePage({ user, profile, queryParams }) {
  // Guard: kalau belum login → redirect ke login
  if (!user) {
    const redirect = '/profile' + (queryParams.toString() ? '?' + queryParams.toString() : '');
    navigate('/login?redirect=' + redirect);
    return el('div');
  }

  const page = el('div', { className: 'buyer-profile' });

  // Loading state — tunggu profile load
  const loadingDiv = el('div', { className: 'container mt-6 text-center' }, [
    el('div', { className: 'spinner', style: { width: '32px', height: '32px', margin: '0 auto 16px', border: '3px solid var(--color-surface-3)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } }),
    el('p', { className: 'text-sm text-muted', text: 'Memuat profil...' }),
  ]);

  // Cek profile langsung
  const current = getCurrentUser();

  if (current?.profile?.role) {
    // Profile sudah tersedia — redirect ke dashboard sesuai role
    const role = current.profile.role;
    const dest = ROLE_DASHBOARD[role] || '/';

    // BUYER tetap di profile page (tidak redirect)
    if (role === ROLE.BUYER) {
      return renderBuyerProfile(current.user, current.profile);
    }

    // SELLER/COURIER/ADMIN → redirect ke dashboard mereka
    setTimeout(() => navigate(dest), 100);
    return el('div', { className: 'container mt-6 text-center' }, [
      el('p', { className: 'text-sm', text: `Mengalihkan ke dashboard ${ROLE_LABELS[role]}...` }),
      el('button', {
        className: 'btn btn-primary mt-4',
        text: `Ke Dashboard ${ROLE_LABELS[role]}`,
        onClick: () => navigate(dest),
      }),
    ]);
  }

  // Profile belum tersedia — tampilkan loading + subscribe ke onAuthChange
  page.appendChild(BuyerHeader({
    location: 'Loading...',
    onSearch: () => {},
    onCart: () => navigate('/cart'),
    onBell: () => navigate('/notifications'),
    cartCount: 0, notifCount: 0,
  }));

  page.appendChild(loadingDiv);
  page.appendChild(BuyerBottomNav({ active: 'profile' }));

  // Subscribe to auth changes — saat profile tersedia, redirect ke dashboard
  let redirected = false;
  const unsub = onAuthChange(({ user: u, profile: p } = {}) => {
    if (redirected || !p?.role) return;
    redirected = true;
    unsub();

    const dest = ROLE_DASHBOARD[p.role] || '/';
    if (p.role === ROLE.BUYER) {
      // Buyer stays on profile — re-render
      loadingDiv.replaceChildren(...renderBuyerProfileContent(u, p).children);
    } else {
      // Seller/Courier/Admin → redirect
      navigate(dest);
    }
  });

  // Fallback: after 5s, jika masih no profile, show buyer profile with info
  setTimeout(() => {
    if (!redirected) {
      redirected = true;
      unsub();
      loadingDiv.replaceChildren(
        el('div', { className: 'card' }, [
          el('h2', { className: 'mb-4', text: 'Akun Anda' }),
          el('p', { className: 'text-sm text-muted mb-4', text: 'Profil belum termuat. Pilih dashboard manually:' }),
          el('div', { className: 'profile-actions' }, [
            el('button', { className: 'btn btn-primary btn-block', html: '🏪 Dashboard Seller', onClick: () => navigate('/seller') }),
            el('button', { className: 'btn btn-primary btn-block', html: '🛵 Dashboard Kurir', onClick: () => navigate('/courier') }),
            el('button', { className: 'btn btn-secondary btn-block', html: '🏠 Beranda Buyer', onClick: () => navigate('/') }),
            el('button', { className: 'btn btn-primary btn-block', html: '📊 Admin Panel', onClick: () => navigate('/admin') }),
          ]),
          el('button', { className: 'btn btn-danger btn-block mt-4', html: '🚪 Keluar', onClick: handleLogout }),
        ])
      );
    }
  }, 5000);

  // Cleanup
  const observer = new MutationObserver(() => {
    if (!document.body.contains(loadingDiv)) {
      if (!redirected) { redirected = true; unsub(); }
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return page;
}

// ----- Buyer Profile (full page) -----
function renderBuyerProfile(user, profile) {
  const page = el('div', { className: 'buyer-profile' });
  page.appendChild(BuyerHeader({
    location: profile?.location?.label || 'Jakarta',
    onSearch: (q) => navigate('/search', { q }),
    onCart: () => navigate('/cart'),
    onBell: () => navigate('/notifications'),
    cartCount: 0, notifCount: 0,
  }));

  const main = el('main', { className: 'container mt-6' });
  page.appendChild(main);
  main.appendChild(renderBuyerProfileContent(user, profile));
  page.appendChild(BuyerBottomNav({ active: 'profile' }));
  return page;
}

function renderBuyerProfileContent(user, profile) {
  const content = el('div');

  // User card
  content.appendChild(
    el('div', { className: 'card profile-card' }, [
      el('div', { className: 'profile-card__header' }, [
        el('div', { className: 'avatar profile-card__avatar', text: initials(profile?.displayName || user?.email || '?') }),
        el('div', { className: 'profile-card__info' }, [
          el('h2', { className: 'fw-700', text: profile?.displayName || 'Pengguna' }),
          el('p', { className: 'text-sm text-muted', text: user?.email }),
          el('span', { className: 'badge badge-primary mt-2', text: ROLE_LABELS[profile?.role] || 'Pembeli' }),
        ]),
      ]),
    ])
  );

  // Account info
  content.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('h2', { className: 'mb-4', text: 'Informasi Akun' }),
      el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'User ID' }), el('span', { className: 'text-sm fw-600', text: user?.uid?.slice(0, 16) + '...' })]),
      el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Email' }), el('span', { className: 'text-sm fw-600', text: user?.email })]),
      profile?.phone ? el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'HP' }), el('span', { className: 'text-sm fw-600', text: profile.phone })]) : null,
      el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Bergabung' }), el('span', { className: 'text-sm fw-600', text: formatDate(profile?.createdAt) })]),
    ])
  );

  // Quick actions
  content.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('h2', { className: 'mb-4', text: 'Menu Cepat' }),
      el('div', { className: 'profile-actions' }, [
        el('button', { className: 'btn btn-secondary btn-block', html: '📦 Pesanan Saya', onClick: () => navigate('/orders') }),
        el('button', { className: 'btn btn-secondary btn-block', html: '❤️ Wishlist', onClick: () => toast.info('Wishlist akan tersedia segera.') }),
        el('button', { className: 'btn btn-secondary btn-block', html: '🔔 Notifikasi', onClick: () => navigate('/notifications') }),
      ]),
    ])
  );

  // Role switcher (kalau user punya multiple roles atau mau akses dashboard lain)
  content.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('h2', { className: 'mb-4', text: 'Akses Dashboard' }),
      el('p', { className: 'text-sm text-muted mb-4', text: 'Kalau kamu punya akun dengan role lain, akses dashboard di sini:' }),
      el('div', { className: 'profile-actions' }, [
        el('button', { className: 'btn btn-secondary btn-block', html: '🏪 Dashboard Seller', onClick: () => navigate('/seller') }),
        el('button', { className: 'btn btn-secondary btn-block', html: '🛵 Dashboard Kurir', onClick: () => navigate('/courier') }),
        el('button', { className: 'btn btn-secondary btn-block', html: '📊 Admin Panel', onClick: () => navigate('/admin') }),
      ]),
    ])
  );

  // Logout
  content.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('button', {
        className: 'btn btn-danger btn-block',
        html: '🚪 Keluar',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Keluar dari akun?',
            message: 'Kamu perlu login lagi untuk mengakses akun.',
            confirmLabel: 'Ya, keluar',
            cancelLabel: 'Batal',
            danger: true,
          });
          if (!ok) return;
          try { await logout(); toast.success('Berhasil keluar.'); navigate('/'); }
          catch (err) { toast.error('Gagal keluar.'); }
        },
      }),
    ])
  );

  return content;
}

async function handleLogout() {
  try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); }
  catch (err) { toast.error('Gagal keluar.'); }
}
