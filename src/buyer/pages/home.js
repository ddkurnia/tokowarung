// ============================================
// TokOnline — Buyer Home Page
// Modern marketplace home 2026, mobile-first.
// ============================================

import { BuyerHeader, BuyerBottomNav, ProductCard, SkeletonCard, SectionHeader, EmptyState, el } from '../../components/ui.js';
import { listApprovedProducts } from '../../services/productService.js';
import { listNearbyStores } from '../../services/storeService.js';
import { getThumbUrl } from '../../services/storageService.js';
import { DEFAULT_CATEGORIES } from '../../utils/constants.js';
import { formatRupiah, formatCompact } from '../../utils/helpers.js';
import { navigate } from '../../router/router.js';

/**
 * Default export: factory function yang return HTMLElement untuk halaman home.
 */
export default async function HomePage({ user, profile }) {
  // Default location (MVP: Jakarta). Production: ambil dari geolocation API.
  const buyerLocation = profile?.location?.label || 'Jakarta';

  const page = el('div', { className: 'buyer-home' });

  // Header
  page.appendChild(
    BuyerHeader({
      location: buyerLocation,
      onSearch: (q) => navigate('/search', { q }),
      onCart: () => navigate('/cart'),
      onBell: () => navigate('/notifications'),
      cartCount: 0,
      notifCount: 0,
    })
  );

  // Hero
  const hero = el('section', { className: 'hero' });
  hero.appendChild(
    el('div', { className: 'hero__bg' })
  );
  const heroContent = el('div', { className: 'hero__content container' });
  heroContent.appendChild(el('h1', { className: 'hero__title', text: 'Belanja dari toko di sekitar kamu' }));
  heroContent.appendChild(el('p', { className: 'hero__subtitle', text: 'Sembako, kuliner, fashion, dan UMKM lokal — sampai ke depan rumah, cepat.' }));
  heroContent.appendChild(
    el('div', { className: 'hero__cta' }, [
      el('button', { className: 'btn btn-primary', text: 'Mulai Belanja', onClick: () => navigate('/search') }),
      user ? null : el('button', { className: 'btn btn-secondary', text: 'Daftar gratis', onClick: () => navigate('/register') }),
    ])
  );
  hero.appendChild(heroContent);
  page.appendChild(hero);

  // Kategori
  const catSection = el('section', { className: 'container mt-6' });
  catSection.appendChild(SectionHeader({ title: 'Kategori' }));
  const catGrid = el('div', { className: 'category-grid' });
  DEFAULT_CATEGORIES.forEach((c) => {
    catGrid.appendChild(
      el('a', {
        className: 'category-card',
        href: '#/search?category=' + c.id,
        attrs: { 'aria-label': c.name },
      }, [
        el('div', { className: 'category-card__icon', html: c.icon }),
        el('span', { className: 'category-card__name', text: c.name }),
      ])
    );
  });
  catSection.appendChild(catGrid);
  page.appendChild(catSection);

  // Skeleton untuk sections berikutnya (lazy load)
  const productsSection = el('section', { className: 'container mt-6' });
  productsSection.appendChild(SectionHeader({ title: 'Produk Terlaris' }));
  const productsGrid = el('div', { className: 'product-grid' });
  for (let i = 0; i < 6; i++) productsGrid.appendChild(SkeletonCard());
  productsSection.appendChild(productsGrid);
  page.appendChild(productsSection);

  // Load produk async (non-blocking)
  loadProducts(productsGrid);

  // Toko Terdekat section
  const storesSection = el('section', { className: 'container mt-6' });
  storesSection.appendChild(SectionHeader({ title: 'Toko Terdekat', action: 'Lihat semua', onAction: () => navigate('/search?type=stores') }));
  const storesGrid = el('div', { className: 'store-list' });
  for (let i = 0; i < 4; i++) {
    storesGrid.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  }
  storesSection.appendChild(storesGrid);
  page.appendChild(storesSection);

  loadStores(storesGrid);

  // Promo section
  const promoSection = el('section', { className: 'container mt-6' });
  promoSection.appendChild(SectionHeader({ title: 'Sedang Promo' }));
  const promoGrid = el('div', { className: 'product-grid' });
  promoSection.appendChild(promoGrid);
  page.appendChild(promoSection);

  // Bottom nav (mobile-first)
  page.appendChild(BuyerBottomNav({ active: 'home' }));

  return page;
}

async function loadProducts(container) {
  try {
    const { items } = await listApprovedProducts({ pageSize: 12 });
    container.replaceChildren();
    if (items.length === 0) {
      container.replaceWith(EmptyState({ icon: '📦', title: 'Belum ada produk', desc: 'Toko lokal belum mengunggah produk. Coba lagi nanti.' }));
      return;
    }
    items.forEach((p) => {
      // Cloudinary: optimize image untuk product card (small thumb)
      const img = p.images?.[0];
      const imageUrl = img ? (img.publicId ? getThumbUrl(img.publicId, 240) : img.url || img) : null;
      container.appendChild(ProductCard({
        id: p.id,
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice,
        image: imageUrl,
        store: p.storeName || '',
        rating: p.rating,
        sold: p.soldCount,
      }));
    });
  } catch (err) {
    console.error('[home] Gagal load products:', err);
    container.replaceWith(EmptyState({ icon: '⚠️', title: 'Gagal memuat produk', desc: 'Coba muat ulang halaman.' }));
  }
}

async function loadStores(container) {
  try {
    const items = await listNearbyStores({ lat: null, lng: null, radiusKm: 100, limit: 8 });
    container.replaceChildren();
    if (items.length === 0) {
      container.replaceWith(EmptyState({ icon: '🏪', title: 'Belum ada toko', desc: 'Belum ada toko terverifikasi di sekitar kamu.' }));
      return;
    }
    items.forEach((s) => {
      container.appendChild(
        el('a', {
          className: 'store-card',
          href: '#/toko/' + s.id,
        }, [
          el('div', { className: 'store-card__logo' }, [
            el('div', { className: 'avatar', attrs: { 'aria-hidden': 'true' }, text: (s.storeName || 'T').charAt(0).toUpperCase() }),
          ]),
          el('div', { className: 'store-card__content' }, [
            el('h3', { className: 'store-card__name', text: s.storeName || 'Toko Tanpa Nama' }),
            el('div', { className: 'store-card__meta' }, [
              s.rating ? el('span', { className: 'badge badge-primary', text: '⭐ ' + s.rating.toFixed(1) }) : null,
              s.isOpen ? el('span', { className: 'badge badge-success', text: 'Buka' }) : el('span', { className: 'badge badge-warning', text: 'Tutup' }),
            ]),
          ]),
        ])
      );
    });
  } catch (err) {
    console.error('[home] Gagal load stores:', err);
    container.replaceWith(EmptyState({ icon: '⚠️', title: 'Gagal memuat toko' }));
  }
}
