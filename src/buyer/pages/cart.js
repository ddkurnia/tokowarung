// ============================================
// TokoWarung — Buyer Cart Page
// Multi-seller cart: grouped per seller, per-seller subtotal, grand total.
// Guest cart (localStorage) + logged-in cart (Firestore) auto-sync.
// ============================================

import { el, EmptyState, BuyerHeader, BuyerBottomNav, SkeletonCard } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { getCart, updateCartQty, removeFromCart, clearCart, groupBySeller, calculateTotals } from '../../services/cartService.js';
import { navigate } from '../../router/router.js';
import { formatRupiah } from '../../utils/helpers.js';
import { getCurrentUser } from '../../auth/authService.js';

export default async function CartPage({ user, profile }) {
  const page = el('div', { className: 'buyer-cart' });

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
  main.appendChild(el('h1', { className: 'mb-4', text: 'Keranjang Belanja' }));
  page.appendChild(main);

  // Loading skeleton
  const content = el('div', { className: 'cart-content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadCart(content, user);

  // Bottom nav
  page.appendChild(BuyerBottomNav({ active: 'cart' }));

  return page;
}

async function loadCart(container, user) {
  try {
    const items = await getCart(user);

    if (items.length === 0) {
      container.replaceChildren(
        EmptyState({
          icon: '🛒',
          title: 'Keranjang kosong',
          desc: 'Belum ada produk di keranjang. Mulai belanja dari toko lokal sekitarmu!',
          action: el('button', {
            className: 'btn btn-primary',
            text: 'Mulai Belanja',
            onClick: () => navigate('/'),
          }),
        })
      );
      return;
    }

    const sellerGroups = groupBySeller(items);
    const grandSubtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const totalItems = items.reduce((s, it) => s + it.qty, 0);
    const serviceFee = 1000; // flat for MVP, will come from settings

    container.replaceChildren();

    // Each seller group
    sellerGroups.forEach((group) => {
      const card = el('div', { className: 'card seller-cart-card' });

      // Seller header
      card.appendChild(
        el('div', { className: 'seller-cart-card__header' }, [
          el('div', { className: 'avatar', text: (group.sellerName || 'T').charAt(0).toUpperCase() }),
          el('div', {}, [
            el('p', { className: 'text-xs text-muted', text: 'Toko' }),
            el('h3', { className: 'fw-600', text: group.sellerName || 'Toko Tanpa Nama' }),
          ]),
        ])
      );

      // Items
      const itemsList = el('div', { className: 'cart-items-list' });
      group.items.forEach((item) => {
        itemsList.appendChild(renderCartItem(item, group.sellerId, user, container));
      });
      card.appendChild(itemsList);

      // Per-seller subtotal
      const { subtotal } = calculateTotals(group);
      card.appendChild(
        el('div', { className: 'seller-cart-card__subtotal row-between' }, [
          el('span', { className: 'text-sm text-muted', text: 'Subtotal toko ini' }),
          el('span', { className: 'fw-700', text: formatRupiah(subtotal) }),
        ])
      );

      container.appendChild(card);
    });

    // Summary + checkout
    const summary = el('div', { className: 'cart-summary card mt-6' }, [
      el('h2', { className: 'mb-4', text: 'Ringkasan' }),
      el('div', { className: 'summary-row' }, [
        el('span', { className: 'text-sm text-muted', text: `Total produk (${totalItems} item)` }),
        el('span', { className: 'fw-600', text: formatRupiah(grandSubtotal) }),
      ]),
      el('div', { className: 'summary-row' }, [
        el('span', { className: 'text-sm text-muted', text: 'Biaya layanan' }),
        el('span', { className: 'fw-600', text: formatRupiah(serviceFee) }),
      ]),
      el('div', { className: 'summary-row summary-row--total' }, [
        el('span', { text: 'Total Bayar' }),
        el('span', { className: 'fw-800 text-lg text-success', text: formatRupiah(grandSubtotal + serviceFee) }),
      ]),
      el('button', {
        className: 'btn btn-primary btn-block btn-lg mt-4',
        text: 'Checkout Sekarang',
        onClick: () => navigate('/checkout'),
      }),
      el('button', {
        className: 'btn btn-ghost btn-block mt-2',
        text: 'Kosongkan Keranjang',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Kosongkan keranjang?',
            message: 'Semua produk akan dihapus dari keranjang. Tindakan ini tidak bisa dibatalkan.',
            confirmLabel: 'Ya, kosongkan',
            cancelLabel: 'Batal',
            danger: true,
          });
          if (ok) {
            await clearCart(user);
            toast.success('Keranjang dikosongkan.');
            loadCart(container, user);
          }
        },
      }),
    ]);
    container.appendChild(summary);
  } catch (err) {
    console.error('[cart] load error:', err);
    container.replaceChildren(
      EmptyState({
        icon: '⚠️',
        title: 'Gagal memuat keranjang',
        desc: 'Terjadi masalah. Coba muat ulang halaman.',
        action: el('button', { className: 'btn btn-primary', text: 'Muat Ulang', onClick: () => window.location.reload() }),
      })
    );
  }
}

function renderCartItem(item, sellerId, user, container) {
  const row = el('div', { className: 'cart-item' }, [
    el('div', { className: 'cart-item__img' }, item.image ? el('img', { attrs: { src: item.image, alt: item.name, loading: 'lazy' } }) : el('span', { html: '🖼️' })),
    el('div', { className: 'cart-item__content' }, [
      el('h3', { className: 'cart-item__name', text: item.name }),
      el('p', { className: 'cart-item__price', text: formatRupiah(item.price) }),
      el('div', { className: 'cart-item__qty' }, [
        el('button', {
          className: 'qty-btn',
          attrs: { 'aria-label': 'Kurangi jumlah' },
          text: '−',
          onClick: async () => {
            if (item.qty <= 1) {
              const ok = await confirmDialog({
                title: 'Hapus produk?',
                message: `"${item.name}" akan dihapus dari keranjang.`,
                confirmLabel: 'Ya, hapus',
                cancelLabel: 'Batal',
                danger: true,
              });
              if (!ok) return;
              await removeFromCart({ user, productId: item.productId, sellerId });
              toast.success('Produk dihapus.');
              loadCart(container, user);
              return;
            }
            await updateCartQty({ user, productId: item.productId, sellerId, qty: item.qty - 1 });
            loadCart(container, user);
          },
        }),
        el('span', { className: 'qty-value', text: String(item.qty) }),
        el('button', {
          className: 'qty-btn',
          attrs: { 'aria-label': 'Tambah jumlah' },
          text: '+',
          onClick: async () => {
            const max = item.stock || 99;
            if (item.qty >= max) {
              toast.warning(`Stok maksimum (${max} unit) tercapai.`);
              return;
            }
            await updateCartQty({ user, productId: item.productId, sellerId, qty: item.qty + 1 });
            loadCart(container, user);
          },
        }),
      ]),
    ]),
    el('div', { className: 'cart-item__right' }, [
      el('p', { className: 'cart-item__subtotal fw-700', text: formatRupiah(item.price * item.qty) }),
      el('button', {
        className: 'btn-link text-xs text-muted',
        text: 'Hapus',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Hapus produk?',
            message: `"${item.name}" akan dihapus dari keranjang.`,
            confirmLabel: 'Ya, hapus',
            cancelLabel: 'Batal',
            danger: true,
          });
          if (!ok) return;
          await removeFromCart({ user, productId: item.productId, sellerId });
          toast.success('Produk dihapus.');
          loadCart(container, user);
        },
      }),
    ]),
  ]);
  return row;
}
