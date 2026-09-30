// ============================================
// TokOnline — Product Detail Page
// SEO-friendly: clean URL /produk/:id
// ============================================

import { el, EmptyState, Spinner, StarRating, SectionHeader } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { getProductById } from '../../services/productService.js';
import { addToCart } from '../../services/cartService.js';
import { navigate } from '../../router/router.js';
import { formatRupiah, haversineKm, estimateShipping } from '../../utils/helpers.js';

export default async function ProductDetailPage({ params, user, profile }) {
  const { id } = params;
  const page = el('div', { className: 'product-detail' });

  // Loading
  page.appendChild(el('div', { className: 'page-skeleton' }));

  try {
    const product = await getProductById(id);
    if (!product) {
      page.replaceChildren(EmptyState({
        icon: '❓',
        title: 'Produk tidak ditemukan',
        desc: 'Produk mungkin telah dihapus atau tidak tersedia.',
        action: el('button', { className: 'btn btn-primary', text: 'Kembali ke Beranda', onClick: () => navigate('/') }),
      }));
      return page;
    }

    renderProduct(page, product, { user, profile });
  } catch (err) {
    console.error('[product] error:', err);
    page.replaceChildren(EmptyState({
      icon: '⚠️',
      title: 'Gagal memuat produk',
      desc: 'Terjadi masalah saat memuat detail produk. Coba lagi.',
    }));
  }

  return page;
}

function renderProduct(page, product, { user, profile }) {
  const buyerLoc = profile?.location;
  const storeLoc = product.sellerLocation;
  const distanceKm = buyerLoc && storeLoc ? haversineKm(buyerLoc.lat, buyerLoc.lng, storeLoc.lat, storeLoc.lng) : null;
  const shippingEstimate = distanceKm != null ? estimateShipping(distanceKm) : null;

  page.replaceChildren();

  // Breadcrumb
  page.appendChild(
    el('div', { className: 'container mt-4' }, [
      el('nav', { className: 'breadcrumb', attrs: { 'aria-label': 'Breadcrumb' } }, [
        el('a', { className: 'breadcrumb__link', href: '#/', text: 'Beranda' }),
        el('span', { className: 'breadcrumb__sep', text: '/' }),
        el('a', { className: 'breadcrumb__link', href: '#/search?category=' + (product.category || ''), text: product.categoryName || product.category || 'Produk' }),
        el('span', { className: 'breadcrumb__sep', text: '/' }),
        el('span', { className: 'breadcrumb__current', text: product.name }),
      ]),
    ])
  );

  // Layout: gallery + info
  const layout = el('div', { className: 'product-detail__layout container' });
  page.appendChild(layout);

  // Gallery
  const gallery = el('div', { className: 'product-gallery' });
  const mainImg = el('div', { className: 'product-gallery__main' });
  if (product.images?.[0]) {
    mainImg.appendChild(el('img', { attrs: { src: product.images[0], alt: product.name, loading: 'eager' } }));
  } else {
    mainImg.appendChild(el('div', { className: 'product-gallery__placeholder', html: '🖼️' }));
  }
  gallery.appendChild(mainImg);

  if (product.images?.length > 1) {
    const thumbs = el('div', { className: 'product-gallery__thumbs' });
    product.images.forEach((src, i) => {
      const img = el('img', {
        attrs: { src, alt: product.name + ' foto ' + (i + 1), loading: 'lazy' },
        onClick: () => {
          const main = gallery.querySelector('.product-gallery__main img');
          if (main) main.src = src;
        },
        className: 'product-gallery__thumb' + (i === 0 ? ' is-active' : ''),
      });
      thumbs.appendChild(img);
    });
    gallery.appendChild(thumbs);
  }
  layout.appendChild(gallery);

  // Info
  const info = el('div', { className: 'product-detail__info' });

  info.appendChild(el('h1', { className: 'product-detail__name', text: product.name }));

  // Rating + sold
  info.appendChild(
    el('div', { className: 'product-detail__meta' }, [
      product.rating ? StarRating({ value: product.rating, size: 16 }) : null,
      el('span', { className: 'text-sm text-muted', text: (product.rating || 0).toFixed(1) + ' • ' + (product.soldCount || 0) + ' terjual' }),
    ])
  );

  // Price
  const priceRow = el('div', { className: 'product-detail__price-row' });
  priceRow.appendChild(el('span', { className: 'product-detail__price', text: formatRupiah(product.price) }));
  if (product.originalPrice && product.originalPrice > product.price) {
    priceRow.appendChild(el('span', { className: 'product-detail__orig-price', text: formatRupiah(product.originalPrice) }));
    const discount = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    priceRow.appendChild(el('span', { className: 'badge badge-danger', text: '-' + discount + '%' }));
  }
  info.appendChild(priceRow);

  // Stock & weight
  info.appendChild(
    el('div', { className: 'product-detail__attrs' }, [
      el('div', { className: 'attr' }, [el('span', { className: 'attr__label', text: 'Stok' }), el('span', { className: 'attr__value', text: (product.stock || 0) + ' unit' })]),
      el('div', { className: 'attr' }, [el('span', { className: 'attr__label', text: 'Berat' }), el('span', { className: 'attr__value', text: (product.weight || 0) + ' gram' })]),
      el('div', { className: 'attr' }, [el('span', { className: 'attr__label', text: 'Kategori' }), el('span', { className: 'attr__value', text: product.categoryName || product.category || '-' })]),
      el('div', { className: 'attr' }, [el('span', { className: 'attr__label', text: 'Lokasi Toko' }), el('span', { className: 'attr__value', text: product.sellerName || 'Toko' })]),
      distanceKm != null ? el('div', { className: 'attr' }, [el('span', { className: 'attr__label', text: 'Jarak' }), el('span', { className: 'attr__value', text: distanceKm.toFixed(1) + ' km' })]) : null,
    ])
  );

  // Description
  info.appendChild(el('h2', { className: 'product-detail__section-title', text: 'Deskripsi' }));
  info.appendChild(el('p', { className: 'product-detail__desc', text: product.description || 'Tidak ada deskripsi.' }));

  // Variations (if any)
  if (product.variants?.length) {
    info.appendChild(el('h2', { className: 'product-detail__section-title', text: 'Pilih Varian' }));
    const variantGrid = el('div', { className: 'variant-grid' });
    product.variants.forEach((v, i) => {
      variantGrid.appendChild(
        el('button', {
          className: 'chip' + (i === 0 ? '' : ''),
          attrs: { 'aria-pressed': i === 0 ? 'true' : 'false' },
          text: v.name + (v.priceDelta ? ' (+' + formatRupiah(v.priceDelta) + ')' : ''),
          onClick: (e) => {
            variantGrid.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
            e.target.setAttribute('aria-pressed', 'true');
          },
        })
      );
    });
    info.appendChild(variantGrid);
  }

  // Shipping estimate
  if (shippingEstimate != null) {
    info.appendChild(
      el('div', { className: 'shipping-estimate' }, [
        el('div', { className: 'shipping-estimate__icon', html: '🛵' }),
        el('div', {}, [
          el('p', { className: 'text-sm fw-600', text: 'Estimasi ongkir' }),
          el('p', { className: 'text-xs text-muted', text: formatRupiah(shippingEstimate) + ' • ' + (distanceKm?.toFixed(1) || 0) + ' km' }),
        ]),
      ])
    );
  }

  layout.appendChild(info);

  // Sticky bottom action bar (mobile-first)
  const actionbar = el('div', { className: 'product-action-bar' });
  actionbar.appendChild(
    el('button', { className: 'icon-btn-large', attrs: { 'aria-label': 'Wishlist' }, html: '❤️', onClick: () => toast.info('Wishlist akan tersedia segera.') })
  );
  actionbar.appendChild(
    el('button', { className: 'btn btn-secondary', text: 'Keranjang', onClick: () => handleAddToCart(product, user, profile, false) })
  );
  actionbar.appendChild(
    el('button', { className: 'btn btn-primary', text: 'Beli Sekarang', onClick: () => handleAddToCart(product, user, profile, true) })
  );
  page.appendChild(actionbar);

  // Report button
  page.appendChild(
    el('div', { className: 'container mt-6 text-center' }, [
      el('button', { className: 'btn-link text-sm text-muted', text: 'Laporkan produk ini', onClick: () => toast.info('Form report akan tersedia segera.') }),
    ])
  );
}

async function handleAddToCart(product, user, profile, buyNow) {
  try {
    await addToCart({
      user,
      profile,
      item: {
        productId: product.id,
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        name: product.name,
        price: product.price,
        image: product.images?.[0] || null,
        qty: 1,
        weight: product.weight || 0,
        stock: product.stock || 99,
      },
    });
    if (buyNow) {
      navigate('/cart');
    } else {
      toast.success('Ditambahkan ke keranjang.');
    }
  } catch (err) {
    console.error('[product] addToCart error:', err);
    toast.error('Gagal menambahkan ke keranjang. Coba lagi.');
  }
}
