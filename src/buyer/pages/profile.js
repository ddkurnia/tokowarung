// ============================================
// TokoWarung — Buyer Profile Page
// Account info, role, quick links, logout.
// ============================================

import { el, BuyerHeader, BuyerBottomNav, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
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

export default async function ProfilePage({ user, profile }) {
  // Guard: kalau belum login → redirect ke login
  if (!user) {
    navigate('/login?redirect=/profile');
    return el('div');
  }

  const page = el('div', { className: 'buyer-profile' });
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
  page.appendChild(main);

  // User card
  main.appendChild(
    el('div', { className: 'card profile-card' }, [
      el('div', { className: 'profile-card__header' }, [
        el('div', { className: 'avatar profile-card__avatar', text: initials(profile?.displayName || user.email || '?') }),
        el('div', { className: 'profile-card__info' }, [
          el('h2', { className: 'fw-700', text: profile?.displayName || 'Pengguna' }),
          el('p', { className: 'text-sm text-muted', text: user.email }),
          el('span', { className: 'badge badge-primary mt-2', text: ROLE_LABELS[profile?.role] || 'Pembeli' }),
        ]),
      ]),
    ])
  );

  // Account info
  main.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('h2', { className: 'mb-4', text: 'Informasi Akun' }),
      el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'User ID' }), el('span', { className: 'text-sm fw-600', text: user.uid.slice(0, 16) + '...' })]),
      el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Email' }), el('span', { className: 'text-sm fw-600', text: user.email })]),
      profile?.phone ? el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'HP' }), el('span', { className: 'text-sm fw-600', text: profile.phone })]) : null,
      el('div', { className: 'summary-row' }, [el('span', { className: 'text-sm text-muted', text: 'Bergabung' }), el('span', { className: 'text-sm fw-600', text: formatDate(profile?.createdAt) })]),
    ])
  );

  // Quick actions
  main.appendChild(
    el('div', { className: 'card mt-4' }, [
      el('h2', { className: 'mb-4', text: 'Menu Cepat' }),
      el('div', { className: 'profile-actions' }, [
        el('button', { className: 'btn btn-secondary btn-block', html: '📦 Pesanan Saya', onClick: () => navigate('/orders') }),
        el('button', { className: 'btn btn-secondary btn-block', html: '❤️ Wishlist', onClick: () => toast.info('Wishlist akan tersedia di Phase 5.') }),
        el('button', { className: 'btn btn-secondary btn-block', html: '🔔 Notifikasi', onClick: () => navigate('/notifications') }),
        el('button', { className: 'btn btn-secondary btn-block', html: '⚙️ Pengaturan Akun', onClick: () => toast.info('Pengaturan akun akan tersedia di Phase 5.') }),
      ]),
    ])
  );

  // Become seller / courier (if buyer)
  if (profile?.role === ROLE.BUYER) {
    main.appendChild(
      el('div', { className: 'card mt-4' }, [
        el('h2', { className: 'mb-4', text: 'Ingin Berjualan?' }),
        el('p', { className: 'text-sm text-muted mb-4', text: 'Daftar sebagai seller atau kurir untuk mulai berjualan atau mengantar pesanan.' }),
        el('div', { className: 'row gap-2' }, [
          el('button', { className: 'btn btn-primary', html: '🏪 Jadi Seller', onClick: () => toast.info('Untuk menjadi seller, daftar akun baru dengan role Seller.') }),
          el('button', { className: 'btn btn-secondary', html: '🛵 Jadi Kurir', onClick: () => toast.info('Untuk menjadi kurir, daftar akun baru dengan role Kurir.') }),
        ]),
      ])
    );
  }

  // Logout
  main.appendChild(
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
          try {
            await logout();
            toast.success('Berhasil keluar.');
            navigate('/');
          } catch (err) {
            toast.error('Gagal keluar. Coba lagi.');
          }
        },
      }),
    ])
  );

  page.appendChild(BuyerBottomNav({ active: 'profile' }));
  return page;
}
