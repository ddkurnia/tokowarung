// ============================================
// TokOnline — Reusable UI Components (Vanilla JS)
// Setiap fungsi return HTMLElement (atau DocumentFragment).
// Tidak ada framework — pakai DOM API langsung.
// ============================================

import { ROLE, UI } from '../utils/constants.js';
import { formatRupiah, formatCompact, truncate, initials } from '../utils/helpers.js';

// ----- Helpers -----
function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.id) node.id = opts.id;
  if (opts.text) node.textContent = opts.text;
  if (opts.html) node.innerHTML = opts.html;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v === null || v === undefined) continue;
      node.setAttribute(k, v);
    }
  }
  if (opts.dataset) {
    for (const [k, v] of Object.entries(opts.dataset)) {
      node.dataset[k] = v;
    }
  }
  if (opts.onClick) node.addEventListener('click', opts.onClick);
  if (opts.listeners) {
    for (const [ev, fn] of Object.entries(opts.listeners)) {
      node.addEventListener(ev, fn);
    }
  }
  if (opts.style) {
    Object.assign(node.style, opts.style);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ============================================
// HEADER (Buyer app)
// ============================================
export function BuyerHeader({ location = 'Jakarta', onSearch, onCart, onBell, cartCount = 0, notifCount = 0 }) {
  const header = el('header', { className: 'buyer-header' });

  const top = el('div', { className: 'buyer-header__top container' }, [
    el('a', { className: 'buyer-header__logo', href: '#/', attrs: { 'aria-label': 'TokOnline home' } }, [
      el('span', { className: 'buyer-header__logo-primary', text: 'TOK' }),
      el('span', { className: 'buyer-header__logo-secondary', text: 'Online' }),
    ]),
    el('button', {
      className: 'buyer-header__location',
      attrs: { 'aria-label': 'Lokasi pengguna: ' + location, title: 'Lokasi' },
    }, [
      el('span', { className: 'icon icon-pin', html: '📍' }),
      el('span', { className: 'buyer-header__location-text', text: truncate(location, 14) }),
    ]),
    el('div', { className: 'buyer-header__actions' }, [
      el('button', {
        className: 'icon-btn',
        attrs: { 'aria-label': 'Notifikasi' },
        onClick: onBell || (() => {}),
      }, [el('span', { html: '🔔' }), notifCount > 0 ? el('span', { className: 'icon-btn__badge', text: String(notifCount) }) : null]),
      el('button', {
        className: 'icon-btn',
        attrs: { 'aria-label': 'Keranjang' },
        onClick: onCart || (() => {}),
      }, [el('span', { html: '🛒' }), cartCount > 0 ? el('span', { className: 'icon-btn__badge', text: String(cartCount) }) : null]),
    ]),
  ]);

  const searchRow = el('div', { className: 'buyer-header__search-row container' }, [
    el('input', {
      className: 'input buyer-header__search',
      attrs: {
        type: 'search',
        placeholder: 'Cari beras, warung, makanan, elektronik…',
        'aria-label': 'Cari produk atau toko',
        autocomplete: 'off',
      },
      listeners: {
        keydown: (e) => {
          if (e.key === 'Enter' && onSearch) onSearch(e.target.value.trim());
        },
      },
    }),
    el('button', {
      className: 'btn btn-primary btn-sm',
      text: 'Cari',
      onClick: () => {
        const input = searchRow.querySelector('input');
        if (onSearch) onSearch(input.value.trim());
      },
    }),
  ]);

  header.append(top, searchRow);
  return header;
}

// ============================================
// BOTTOM NAV (mobile buyer)
// ============================================
export function BuyerBottomNav({ active = 'home' }) {
  const items = [
    { id: 'home', label: 'Beranda', icon: '🏠', href: '#/' },
    { id: 'search', label: 'Cari', icon: '🔍', href: '#/search' },
    { id: 'orders', label: 'Pesanan', icon: '📦', href: '#/orders' },
    { id: 'wishlist', label: 'Wishlist', icon: '❤️', href: '#/wishlist' },
    { id: 'profile', label: 'Profil', icon: '👤', href: '#/profile' },
  ];
  const nav = el('nav', { className: 'bottom-nav', attrs: { 'aria-label': 'Navigasi utama' } });
  items.forEach((it) => {
    nav.append(
      el('a', {
        className: 'bottom-nav__item' + (active === it.id ? ' is-active' : ''),
        href: it.href,
        attrs: { 'aria-current': active === it.id ? 'page' : 'false' },
      }, [
        el('span', { className: 'bottom-nav__icon', html: it.icon }),
        el('span', { className: 'bottom-nav__label', text: it.label }),
      ])
    );
  });
  return nav;
}

// ============================================
// PRODUCT CARD
// ============================================
export function ProductCard({ id, name, price, originalPrice, image, store, rating, sold, distance }) {
  const card = el('a', {
    className: 'product-card',
    href: '#/produk/' + id,
    attrs: { 'aria-label': name },
  });

  // Image with placeholder + discount badge
  const imgWrap = el('div', { className: 'product-card__img-wrap' });
  if (image) {
    const img = el('img', { attrs: { src: image, alt: name, loading: 'lazy', decoding: 'async' } });
    imgWrap.appendChild(img);
  } else {
    imgWrap.appendChild(el('div', { className: 'product-card__img-placeholder', html: '🖼️' }));
  }
  if (originalPrice && originalPrice > price) {
    const discount = Math.round(((originalPrice - price) / originalPrice) * 100);
    imgWrap.appendChild(el('span', { className: 'product-card__discount', text: '-' + discount + '%' }));
  }
  card.appendChild(imgWrap);

  // Content
  const content = el('div', { className: 'product-card__content' });
  content.appendChild(el('h3', { className: 'product-card__name', text: truncate(name, 60) }));

  // Price
  const priceRow = el('div', { className: 'product-card__price-row' });
  priceRow.appendChild(el('span', { className: 'product-card__price', text: formatRupiah(price) }));
  if (originalPrice && originalPrice > price) {
    priceRow.appendChild(el('span', { className: 'product-card__orig-price', text: formatRupiah(originalPrice) }));
  }
  content.appendChild(priceRow);

  // Meta (store, rating, sold, distance)
  const meta = el('div', { className: 'product-card__meta' });
  if (store) {
    meta.appendChild(el('span', { className: 'product-card__store', text: truncate(store, 24) }));
  }
  if (rating) {
    meta.appendChild(el('span', { className: 'product-card__rating', html: '⭐ ' + rating.toFixed(1) }));
  }
  if (sold) {
    meta.appendChild(el('span', { className: 'product-card__sold', text: formatCompact(sold) + ' terjual' }));
  }
  if (distance != null) {
    meta.appendChild(el('span', { className: 'product-card__distance', text: distance.toFixed(1) + ' km' }));
  }
  content.appendChild(meta);

  card.appendChild(content);
  return card;
}

// ============================================
// SKELETON CARD (untuk loading)
// ============================================
export function SkeletonCard() {
  return el('div', { className: 'product-card' }, [
    el('div', { className: 'skeleton', style: { height: '160px', borderRadius: 'var(--radius-md)' } }),
    el('div', { className: 'product-card__content' }, [
      el('div', { className: 'skeleton skeleton-text', style: { height: '14px', width: '90%' } }),
      el('div', { className: 'skeleton skeleton-text', style: { height: '14px', width: '60%' } }),
      el('div', { className: 'skeleton skeleton-text', style: { height: '12px', width: '40%', marginTop: '8px' } }),
    ]),
  ]);
}

// ============================================
// EMPTY STATE
// ============================================
export function EmptyState({ icon = '📭', title = 'Belum ada data', desc = '', action }) {
  const node = el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state__icon', html: icon }),
    el('div', { className: 'empty-state__title', text: title }),
    desc ? el('p', { className: 'empty-state__desc', text: desc }) : null,
    action || null,
  ]);
  return node;
}

// ============================================
// LOADING SPINNER
// ============================================
export function Spinner({ size = 24, label = 'Memuat' }) {
  return el('div', { className: 'spinner-wrap', attrs: { role: 'status', 'aria-live': 'polite' } }, [
    el('div', { className: 'spinner', style: { width: size + 'px', height: size + 'px', borderWidth: (size / 11) + 'px' } }),
    label ? el('span', { className: 'spinner-label', text: label }) : null,
  ]);
}

// ============================================
// SECTION HEADER (utk home page sections)
// ============================================
export function SectionHeader({ title, action, onAction }) {
  return el('div', { className: 'section-header' }, [
    el('h2', { className: 'section-header__title', text: title }),
    action
      ? el('button', { className: 'section-header__action', text: action, onClick: onAction })
      : null,
  ]);
}

// ============================================
// STAR RATING DISPLAY
// ============================================
export function StarRating({ value = 0, size = 14 }) {
  const wrap = el('span', { className: 'star-rating', attrs: { 'aria-label': 'Rating ' + value.toFixed(1) + ' dari 5' } });
  for (let i = 1; i <= 5; i++) {
    const filled = value >= i - 0.25;
    const half = !filled && value >= i - 0.75;
    const star = el('span', { className: 'star' + (filled ? ' star--filled' : half ? ' star--half' : ''), html: '★', style: { fontSize: size + 'px' } });
    wrap.appendChild(star);
  }
  return wrap;
}

// ============================================
// TOAST (modal bootstrap dipanggil dari toast.js)
// ============================================
export { el, clear };
