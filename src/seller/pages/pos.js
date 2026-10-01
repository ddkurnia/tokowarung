// ============================================
// TokoWarung — Seller POS Page (Phase 6 — foundation)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listSellerProducts } from '../../services/sellerDashboardService.js';
import { recordOfflineSale, listOfflineSales, getTodayOfflineSales } from '../../services/posService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';
import { getImageUrl } from '../../services/storageService.js';

export default async function SellerPOSPage({ user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller/pos');
    return el('div');
  }

  const page = el('div', { className: 'dashboard' });
  page.appendChild(renderSidebar());

  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'POS Offline' }),
      el('button', { className: 'btn btn-primary btn-sm', text: '+ Record Sale', onClick: () => showSaleModal(user.uid, main) }),
    ])
  );

  const content = el('div', { className: 'dashboard__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadPOSData(content, user.uid);

  return page;
}

async function loadPOSData(container, sellerId) {
  try {
    const [todaySales, salesHistory, productsResult] = await Promise.all([
      getTodayOfflineSales(sellerId),
      listOfflineSales(sellerId, { pageSize: 20 }),
      listSellerProducts(sellerId, { pageSize: 100 }),
    ]);

    container.replaceChildren();

    // Today stats
    container.appendChild(
      el('div', { className: 'stats-grid' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'Today Offline Sales' }),
          el('p', { className: 'stat-card__value', text: String(todaySales.count) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Today Revenue' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(todaySales.totalRevenue) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Items Sold' }),
          el('p', { className: 'stat-card__value', text: String(todaySales.itemsSold) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Total Products' }),
          el('p', { className: 'stat-card__value', text: String(productsResult.items.length) }),
        ]),
      ])
    );

    // Recent sales
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '🛒 Recent Offline Sales' }),
        salesHistory.items.length === 0
          ? EmptyState({ icon: '🛒', title: 'Belum ada offline sales', desc: 'Klik "+ Record Sale" untuk catat penjualan offline.' })
          : el('div', {}, salesHistory.items.map((sale) =>
              el('div', { className: 'product-row' }, [
                el('div', { className: 'product-row__content' }, [
                  el('h3', { className: 'product-row__name', text: formatRupiah(sale.totalAmount) }),
                  el('p', { className: 'text-xs text-muted', text: `${sale.items?.length || 0} items • ${sale.paymentMethod} • ${sale.customerName}` }),
                  el('p', { className: 'text-xs text-muted', text: formatDate(sale.createdAt) }),
                ]),
                el('span', { className: 'badge badge-success', text: 'OFFLINE' }),
              ])
            )),
      ])
    );
  } catch (err) {
    console.error('[seller pos] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat', desc: err.message }));
  }
}

function showSaleModal(sellerId, container) {
  let customerInput, paymentMethodSelect;
  const itemsContainer = el('div', {});
  const selectedItems = {}; // { productId: { product, qty } }

  showModal({
    title: 'Record Offline Sale',
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: 'Catat penjualan offline (walk-in customer). Stok produk akan otomatis berkurang.' }),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Customer Name (opsional)' }),
        customerInput = el('input', { className: 'input', attrs: { type: 'text', placeholder: 'Walk-in Customer' } }),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Payment Method' }),
        paymentMethodSelect = el('select', { className: 'select' }, [
          el('option', { attrs: { value: 'CASH' } }, ['Cash']),
          el('option', { attrs: { value: 'QRIS' } }, ['QRIS']),
          el('option', { attrs: { value: 'DEBIT' } }, ['Debit Card']),
        ]),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Pilih Produk (klik untuk tambah)' }),
        el('div', { id: 'productGrid' }, [el('p', { className: 'text-sm text-muted', text: 'Loading products...' })]),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Items Dipilih' }),
        itemsContainer,
      ]),

      el('div', { className: 'banner banner-info' }, [
        el('div', { id: 'totalDisplay' }, [
          el('p', { className: 'fw-700 text-lg', text: 'Total: Rp 0' }),
        ]),
      ]),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Record Sale',
        variant: 'primary',
        onClick: async (c) => {
          const items = Object.values(selectedItems).map((it) => ({
            productId: it.product.id,
            name: it.product.name,
            price: it.product.price,
            qty: it.qty,
          }));
          if (items.length === 0) return toast.error('Pilih minimal 1 produk.');

          const totalAmount = items.reduce((s, it) => s + it.price * it.qty, 0);
          try {
            await recordOfflineSale({
              sellerId,
              items,
              paymentMethod: paymentMethodSelect.value,
              totalAmount,
              customerName: customerInput.value.trim() || 'Walk-in Customer',
            });
            toast.success('Offline sale recorded! Stok produk diupdate.');
            c();
            loadPOSData(container, sellerId);
          } catch (err) { toast.error(err.message); }
        },
      },
    ],
  });

  // Load products & render
  (async () => {
    try {
      const { items } = await listSellerProducts(sellerId, { pageSize: 50 });
      const grid = document.getElementById('productGrid');
      if (!grid) return;
      grid.replaceChildren();
      if (items.length === 0) {
        grid.appendChild(el('p', { className: 'text-sm text-muted', text: 'Belum ada produk di toko.' }));
        return;
      }
      items.forEach((p) => {
        const card = el('div', {
          className: 'product-row',
          onClick: () => {
            if (!selectedItems[p.id]) {
              selectedItems[p.id] = { product: p, qty: 1 };
            } else {
              selectedItems[p.id].qty++;
            }
            updateItemsDisplay();
          },
        }, [
          el('div', { className: 'product-row__img' }, p.images?.[0]?.publicId
            ? el('img', { attrs: { src: getImageUrl(p.images[0].publicId, { width: 48, height: 48, crop: 'fill', quality: 'auto:low' }), alt: p.name } })
            : el('span', { html: '🖼️' })),
          el('div', { className: 'product-row__content' }, [
            el('p', { className: 'text-sm fw-600', text: p.name }),
            el('p', { className: 'text-xs text-muted', text: formatRupiah(p.price) }),
          ]),
          el('span', { className: 'badge badge-info', text: `Stok: ${p.stock || 0}` }),
        ]);
        card.style.cursor = 'pointer';
        grid.appendChild(card);
      });
    } catch (err) {
      console.warn('[pos] load products:', err);
    }
  })();

  function updateItemsDisplay() {
    itemsContainer.replaceChildren();
    let total = 0;
    Object.values(selectedItems).forEach((it) => {
      const subtotal = it.product.price * it.qty;
      total += subtotal;
      itemsContainer.appendChild(
        el('div', { className: 'product-row' }, [
          el('div', { className: 'product-row__content' }, [
            el('p', { className: 'text-sm fw-600', text: it.product.name }),
            el('p', { className: 'text-xs text-muted', text: `${it.qty} × ${formatRupiah(it.product.price)}` }),
          ]),
          el('div', { className: 'row gap-2' }, [
            el('button', { className: 'qty-btn', text: '−', onClick: () => { it.qty = Math.max(1, it.qty - 1); updateItemsDisplay(); } }),
            el('span', { className: 'qty-value', text: String(it.qty) }),
            el('button', { className: 'qty-btn', text: '+', onClick: () => { it.qty++; updateItemsDisplay(); } }),
            el('span', { className: 'fw-600', text: formatRupiah(subtotal) }),
            el('button', { className: 'btn-link text-xs text-danger', text: 'Hapus', onClick: () => { delete selectedItems[it.product.id]; updateItemsDisplay(); } }),
          ]),
        ])
      );
    });
    if (Object.keys(selectedItems).length === 0) {
      itemsContainer.appendChild(el('p', { className: 'text-sm text-muted', text: 'Belum ada item. Klik produk di atas untuk tambah.' }));
    }
    const totalDisplay = document.getElementById('totalDisplay');
    if (totalDisplay) totalDisplay.replaceChildren(el('p', { className: 'fw-700 text-lg', text: 'Total: ' + formatRupiah(total) }));
  }
  updateItemsDisplay();
}

function renderSidebar() {
  const items = [
    { id: 'dashboard', label: 'Dashboard', href: '#/seller', icon: '📊' },
    { id: 'analytics', label: 'Analytics', href: '#/seller/analytics', icon: '📈' },
    { id: 'products', label: 'Produk', href: '#/seller/products', icon: '📦' },
    { id: 'orders', label: 'Pesanan', href: '#/seller/orders', icon: '📋' },
    { id: 'finance', label: 'Keuangan', href: '#/seller/finance', icon: '💰' },
    { id: 'vouchers', label: 'Voucher', href: '#/seller/vouchers', icon: '🎟️' },
    { id: 'ads', label: 'Iklan', href: '#/seller/ads', icon: '📢' },
    { id: 'pos', label: 'POS Offline', href: '#/seller/pos', icon: '🛒' },
    { id: 'settings', label: 'Pengaturan Toko', href: '#/seller/settings', icon: '⚙️' },
  ];
  const nav = el('aside', { className: 'dashboard__sidebar' });
  nav.appendChild(el('div', { className: 'dashboard__brand', html: 'Toko<span>Warung</span> Seller' }));
  items.forEach((it) => {
    nav.appendChild(el('a', { className: 'nav-item' + (it.id === 'pos' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  return nav;
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
