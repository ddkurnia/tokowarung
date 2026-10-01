// ============================================
// TokoWarung — Seller Ads Management (Phase 5.5)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, showModal } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { listSellerCampaigns, createCampaign, toggleCampaignPause, listSellerProducts } from '../../services/adsService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRupiah, formatDate } from '../../utils/helpers.js';

export default async function SellerAdsPage({ user, profile }) {
  if (profile?.role !== ROLE.SELLER) {
    navigate('/login?redirect=/seller/ads');
    return el('div');
  }

  const page = el('div', { className: 'dashboard' });
  page.appendChild(renderSidebar());

  const main = el('main', { className: 'dashboard__main' });
  page.appendChild(main);

  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Iklan Produk' }),
      el('div', { className: 'row gap-2' }, [
        el('button', {
          className: 'btn btn-primary btn-sm',
          text: '+ Buat Campaign',
          onClick: () => showCreateModal(user.uid, main),
        }),
        el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
      ]),
    ])
  );

  const content = el('div', { className: 'dashboard__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  loadCampaigns(content, user.uid);

  return page;
}

async function loadCampaigns(container, sellerId) {
  try {
    const { items } = await listSellerCampaigns(sellerId);

    container.replaceChildren();

    const active = items.filter((c) => c.status === 'ACTIVE');
    const pending = items.filter((c) => c.status === 'PENDING_APPROVAL');
    const totalSpent = items.reduce((s, c) => s + (c.spentAmount || 0), 0);
    const totalImpressions = items.reduce((s, c) => s + (c.impressions || 0), 0);
    const totalClicks = items.reduce((s, c) => s + (c.clicks || 0), 0);

    container.appendChild(
      el('div', { className: 'stats-grid mb-6' }, [
        el('div', { className: 'stat-card stat-card--success' }, [
          el('p', { className: 'stat-card__label', text: 'Total Campaign' }),
          el('p', { className: 'stat-card__value', text: String(items.length) }),
        ]),
        el('div', { className: 'stat-card stat-card--info' }, [
          el('p', { className: 'stat-card__label', text: 'Aktif' }),
          el('p', { className: 'stat-card__value', text: String(active.length) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Total Spent' }),
          el('p', { className: 'stat-card__value', text: formatRupiah(totalSpent) }),
        ]),
        el('div', { className: 'stat-card stat-card--primary' }, [
          el('p', { className: 'stat-card__label', text: 'Impressions' }),
          el('p', { className: 'stat-card__value', text: String(totalImpressions) }),
        ]),
      ])
    );

    if (pending.length > 0) {
      container.appendChild(
        el('div', { className: 'banner banner-info mb-6' }, [
          el('div', {}, [
            el('h3', { className: 'banner__title', text: `⏳ ${pending.length} Campaign Menunggu Approval` }),
            el('p', { className: 'banner__desc', text: 'Admin akan review campaign kamu dalam 1x24 jam.' }),
          ]),
        ])
      );
    }

    if (items.length === 0) {
      container.appendChild(
        EmptyState({
          icon: '📢',
          title: 'Belum ada campaign',
          desc: 'Buat campaign pertamamu untuk promote produk di homepage TokoWarung.',
        })
      );
      return;
    }

    items.forEach((c) => container.appendChild(renderCampaignCard(c, sellerId, container)));
  } catch (err) {
    console.error('[seller ads] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat campaign', desc: err.message }));
  }
}

function renderCampaignCard(c, sellerId, container) {
  const statusColor = {
    ACTIVE: 'success',
    PAUSED: 'warning',
    PENDING_APPROVAL: 'info',
    COMPLETED: 'info',
    REJECTED: 'danger',
    DRAFT: 'info',
  }[c.status] || 'info';

  const budgetUsed = (c.spentAmount / c.budget * 100).toFixed(1);
  const CTR = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0';
  const CVR = c.clicks > 0 ? ((c.orders / c.clicks) * 100).toFixed(2) : '0';

  return el('div', { className: 'card ad-card mb-4' }, [
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'fw-700', text: c.campaignName }),
        el('p', { className: 'text-xs text-muted', text: `Product ID: ${c.productId?.slice(0, 12)}...` }),
      ]),
      el('span', { className: 'badge badge-' + statusColor, text: c.status.replace(/_/g, ' ') }),
    ]),
    el('div', { className: 'row gap-6 mb-3' }, [
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Budget' }), el('p', { className: 'fw-600', text: formatRupiah(c.budget) })]),
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Terpakai' }), el('p', { className: 'fw-600 text-warning', text: `${formatRupiah(c.spentAmount || 0)} (${budgetUsed}%)` })]),
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Impr' }), el('p', { className: 'fw-600', text: String(c.impressions || 0) })]),
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Clicks' }), el('p', { className: 'fw-600', text: String(c.clicks || 0) })]),
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'CTR' }), el('p', { className: 'fw-600', text: CTR + '%' })]),
      el('div', {}, [el('p', { className: 'text-xs text-muted', text: 'Orders' }), el('p', { className: 'fw-600 text-success', text: String(c.orders || 0) })]),
    ]),
    el('p', { className: 'text-xs text-muted', text: `${formatDate(c.startDate?.toDate ? c.startDate.toDate() : c.startDate)} → ${formatDate(c.endDate?.toDate ? c.endDate.toDate() : c.endDate)}` }),
    c.rejectionReason ? el('p', { className: 'text-xs text-danger mt-2', text: `Reject reason: ${c.rejectionReason}` }) : null,
    el('div', { className: 'row gap-2 mt-3' }, [
      c.status === 'ACTIVE'
        ? el('button', {
            className: 'btn btn-secondary btn-sm',
            text: 'Pause',
            onClick: async () => {
              try { await toggleCampaignPause(c.id, sellerId, true); toast.success('Campaign di-pause.'); loadCampaigns(container, sellerId); } catch (err) { toast.error(err.message); }
            },
          })
        : null,
      c.status === 'PAUSED'
        ? el('button', {
            className: 'btn btn-success btn-sm',
            text: 'Resume',
            onClick: async () => {
              try { await toggleCampaignPause(c.id, sellerId, false); toast.success('Campaign resumed.'); loadCampaigns(container, sellerId); } catch (err) { toast.error(err.message); }
            },
          })
        : null,
    ]),
  ]);
}

function showCreateModal(sellerId, container) {
  let nameInput, productSelect, budgetInput, bidInput, startDateInput, endDateInput;

  // Load seller's products first to populate dropdown
  showModal({
    title: 'Buat Campaign Iklan',
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: 'Promote produk di homepage TokoWarung. Bayar per impression (default Rp 50).' }),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Nama Campaign' }),
        nameInput = el('input', { className: 'input', attrs: { type: 'text', placeholder: 'Promo Lebaran Beras', required: '' } }),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Pilih Produk (load dari tokomu)' }),
        productSelect = el('select', { className: 'select' }, [el('option', { attrs: { value: '' } }, ['Loading products...'])]),
      ]),

      el('div', { className: 'checkout-form-grid' }, [
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Budget (Rp)' }),
          budgetInput = el('input', { className: 'input', attrs: { type: 'number', placeholder: '50000', min: '5000', required: '' } }),
          el('p', { className: 'field-hint', text: 'Min Rp 5.000' }),
        ]),
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Bid per Impression (Rp)' }),
          bidInput = el('input', { className: 'input', attrs: { type: 'number', value: '50', min: '10' } }),
        ]),
      ]),

      el('div', { className: 'checkout-form-grid' }, [
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Mulai' }),
          startDateInput = el('input', { className: 'input', attrs: { type: 'date', required: '' } }),
        ]),
        el('div', { className: 'field mb-4' }, [
          el('label', { className: 'field-label', text: 'Berakhir' }),
          endDateInput = el('input', { className: 'input', attrs: { type: 'date', required: '' } }),
        ]),
      ]),

      el('p', { className: 'text-xs text-muted', text: 'Campaign perlu di-approve admin dulu (1x24 jam) sebelum tampil di homepage.' }),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Submit untuk Approval',
        variant: 'primary',
        onClick: async (c) => {
          const campaignName = nameInput.value.trim();
          const productId = productSelect.value;
          const budget = parseInt(budgetInput.value, 10);
          const bidPerImpression = parseInt(bidInput.value, 10) || 50;
          const startDate = startDateInput.value;
          const endDate = endDateInput.value;

          if (!campaignName || campaignName.length < 5) return toast.error('Nama campaign min 5 karakter.');
          if (!productId) return toast.error('Pilih produk.');
          if (!budget || budget < 5000) return toast.error('Budget minimum Rp 5.000.');
          if (!startDate || !endDate) return toast.error('Tanggal wajib.');

          try {
            await createCampaign({
              sellerId, productId, campaignName, budget, bidPerImpression,
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate + 'T23:59:59').toISOString(),
              targetLocation: null,
            });
            toast.success('Campaign submitted untuk approval!');
            c();
            loadCampaigns(container, sellerId);
          } catch (err) { toast.error(err.message); }
        },
      },
    ],
  });

  // Load products async
  (async () => {
    try {
      const { items } = await listSellerProducts(sellerId, { pageSize: 100 });
      productSelect.innerHTML = '';
      if (items.length === 0) {
        productSelect.appendChild(el('option', { attrs: { value: '' } }, ['Belum ada produk']));
      } else {
        productSelect.appendChild(el('option', { attrs: { value: '' } }, ['Pilih produk...']));
        items.forEach((p) => {
          productSelect.appendChild(el('option', { attrs: { value: p.id } }, [`${p.name} (Rp ${p.price?.toLocaleString('id-ID') || '?'})`]));
        });
      }
    } catch (err) {
      console.warn('[ads] load products:', err);
      productSelect.innerHTML = '';
      productSelect.appendChild(el('option', { attrs: { value: '' } }, ['Gagal load products']));
    }
  })();
}

function renderSidebar() {
  const items = [
    { id: 'dashboard', label: 'Dashboard', href: '#/seller', icon: '📊' },
    { id: 'products', label: 'Produk', href: '#/seller/products', icon: '📦' },
    { id: 'orders', label: 'Pesanan', href: '#/seller/orders', icon: '📋' },
    { id: 'finance', label: 'Keuangan', href: '#/seller/finance', icon: '💰' },
    { id: 'vouchers', label: 'Voucher', href: '#/seller/vouchers', icon: '🎟️' },
    { id: 'ads', label: 'Iklan', href: '#/seller/ads', icon: '📢' },
    { id: 'settings', label: 'Pengaturan Toko', href: '#/seller/settings', icon: '⚙️' },
  ];
  const nav = el('aside', { className: 'dashboard__sidebar' });
  nav.appendChild(el('div', { className: 'dashboard__brand', html: 'Toko<span>Warung</span> Seller' }));
  items.forEach((it) => {
    nav.appendChild(el('a', { className: 'nav-item' + (it.id === 'ads' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  return nav;
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
