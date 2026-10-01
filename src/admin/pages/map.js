// ============================================
// TokoWarung — Admin Operational Map (Phase 7)
// ============================================
// Live map showing all online couriers + active deliveries.
// Uses Leaflet + OpenStreetMap.
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { subscribeToOnlineCouriers, subscribeToActiveDeliveries } from '../../services/trackingService.js';
import { createMap, updateMapMarker, clearMapMarkers, addMapMarker } from '../../components/map.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { formatRelativeTime } from '../../utils/helpers.js';

const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', href: '#/admin', icon: '📊' },
  { id: 'analytics', label: 'Analytics', href: '#/admin/analytics', icon: '📈' },
  { id: 'map', label: 'Live Map', href: '#/admin/map', icon: '🗺️' },
  { id: 'orders', label: 'Orders', href: '#/admin/orders', icon: '📦' },
  { id: 'users', label: 'Users', href: '#/admin/users', icon: '👥' },
  { id: 'moderation', label: 'Moderation', href: '#/admin/products', icon: '🛡️' },
  { id: 'reports', label: 'Reports', href: '#/admin/reports', icon: '🚨' },
  { id: 'disputes', label: 'Disputes', href: '#/admin/disputes', icon: '⚖️' },
  { id: 'incidents', label: 'Incidents', href: '#/admin/incidents', icon: '⚠️' },
  { id: 'fraud', label: 'Fraud', href: '#/admin/fraud', icon: '🔍' },
  { id: 'ads', label: 'Ads', href: '#/admin/ads', icon: '📢' },
  { id: 'finance', label: 'Finance', href: '#/admin/finance', icon: '💰' },
  { id: 'audit', label: 'Audit Logs', href: '#/admin/audit', icon: '📜' },
  { id: 'settings', label: 'Settings', href: '#/admin/settings', icon: '⚙️' },
];

export default async function AdminMapPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/map');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  // Sidebar
  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'map' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: '🗺️ Live Operational Map' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('p', { className: 'text-sm text-muted mb-4', text: 'Real-time map semua kurir online + active deliveries.' }));

  // Map container
  const mapDiv = el('div', { id: 'adminMap', style: { width: '100%', height: '500px', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: '20px' } });
  content.appendChild(mapDiv);

  // Stats below map
  const statsDiv = el('div', { className: 'stats-grid' });
  content.appendChild(statsDiv);

  // Courier list
  const courierListDiv = el('div', { className: 'card mt-4' });
  courierListDiv.appendChild(el('h2', { className: 'mb-4', text: '🛵 Online Couriers' }));
  const courierList = el('div', { id: 'courierList' });
  courierList.appendChild(el('p', { className: 'text-sm text-muted', text: 'Loading...' }));
  courierListDiv.appendChild(courierList);
  content.appendChild(courierListDiv);

  // Active deliveries
  const deliveriesDiv = el('div', { className: 'card mt-4' });
  deliveriesDiv.appendChild(el('h2', { className: 'mb-4', text: '📦 Active Deliveries' }));
  const deliveriesList = el('div', { id: 'deliveriesList' });
  deliveriesList.appendChild(el('p', { className: 'text-sm text-muted', text: 'Loading...' }));
  deliveriesListDiv.appendChild(deliveriesList);
  content.appendChild(deliveriesList);

  page.appendChild(main);

  // Initialize map & subscribe to realtime data
  let mapContainer = null;
  let couriersUnsub = null;
  let deliveriesUnsub = null;
  const courierMarkers = {}; // { courierId: markerIndex }

  (async () => {
    mapContainer = await createMap({
      lat: -6.2, lng: 106.8, zoom: 12, height: 500,
      markers: [],
    });
    mapDiv.appendChild(mapContainer);

    // Subscribe to online couriers
    couriersUnsub = subscribeToOnlineCouriers((couriers) => {
      updateCourierMarkers(couriers, mapContainer, courierMarkers, statsDiv, courierList);
    });

    // Subscribe to active deliveries
    deliveriesUnsub = subscribeToActiveDeliveries((deliveries) => {
      updateDeliveriesList(deliveries, deliveriesList, statsDiv);
    });
  })();

  // Cleanup on navigate
  const observer = new MutationObserver(() => {
    if (!document.body.contains(mapDiv)) {
      if (couriersUnsub) couriersUnsub();
      if (deliveriesUnsub) deliveriesUnsub();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return page;
}

function updateCourierMarkers(couriers, mapContainer, courierMarkers, statsDiv, listContainer) {
  if (!mapContainer) return;

  // Clear old markers
  clearMapMarkers(mapContainer);

  // Add markers for each courier with location
  couriers.forEach((c) => {
    if (!c.currentLocation) return;
    const popup = `🛵 ${c.fullName || 'Kurir'}<br>Status: ${c.status}<br>Vehicle: ${c.vehicleType || '-'}<br>Last seen: ${formatRelativeTime(c.lastSeenAt)}`;
    addMapMarker(mapContainer, c.currentLocation.lat, c.currentLocation.lng, popup, c.fullName || 'Kurir');
  });

  // Update stats
  const onlineCount = couriers.length;
  const withLocation = couriers.filter((c) => c.currentLocation).length;
  const available = couriers.filter((c) => c.status === 'ONLINE_AVAILABLE').length;
  const busy = couriers.filter((c) => c.status === 'ORDER_OFFERED' || c.status === 'DELIVERING').length;

  statsDiv.replaceChildren(
    el('div', { className: 'stat-card stat-card--success' }, [
      el('p', { className: 'stat-card__label', text: 'Online Couriers' }),
      el('p', { className: 'stat-card__value', text: String(onlineCount) }),
    ]),
    el('div', { className: 'stat-card stat-card--info' }, [
      el('p', { className: 'stat-card__label', text: 'Available' }),
      el('p', { className: 'stat-card__value', text: String(available) }),
    ]),
    el('div', { className: 'stat-card stat-card--warning' }, [
      el('p', { className: 'stat-card__label', text: 'Busy' }),
      el('p', { className: 'stat-card__value', text: String(busy) }),
    ]),
    el('div', { className: 'stat-card stat-card--primary' }, [
      el('p', { className: 'stat-card__label', text: 'With GPS' }),
      el('p', { className: 'stat-card__value', text: String(withLocation) }),
    ]),
  );

  // Update list
  if (couriers.length === 0) {
    listContainer.replaceChildren(EmptyState({ icon: '🛵', title: 'Tidak ada kurir online', desc: 'Saat kurir online, akan muncul di sini.' }));
    return;
  }

  listContainer.replaceChildren(...couriers.map((c) =>
    el('div', { className: 'product-row' }, [
      el('div', { className: 'avatar', text: (c.fullName || 'K').charAt(0).toUpperCase() }),
      el('div', { className: 'product-row__content' }, [
        el('h3', { className: 'product-row__name', text: c.fullName || 'Kurir' }),
        el('p', { className: 'text-xs text-muted', text: `${c.status} • ${c.vehicleType || '-'} • ${c.currentLocation ? 'GPS ON' : 'NO GPS'}` }),
        el('p', { className: 'text-xs text-muted', text: 'Last seen: ' + formatRelativeTime(c.lastSeenAt) }),
      ]),
      el('span', { className: 'badge badge-' + (c.status === 'ONLINE_AVAILABLE' ? 'success' : 'warning'), text: c.status }),
    ])
  ));
}

function updateDeliveriesList(deliveries, listContainer, statsDiv) {
  if (deliveries.length === 0) {
    listContainer.replaceChildren(EmptyState({ icon: '📦', title: 'Tidak ada active delivery' }));
    return;
  }

  listContainer.replaceChildren(...deliveries.map((d) =>
    el('div', { className: 'product-row' }, [
      el('div', { className: 'product-row__content' }, [
        el('h3', { className: 'product-row__name', text: 'Order #' + d.id.slice(-8).toUpperCase() }),
        el('p', { className: 'text-xs text-muted', text: `${d.orderStatus} • Buyer: ${d.buyerId?.slice(0, 8)}... • Courier: ${d.courierId?.slice(0, 8) || 'None'}...` }),
      ]),
      el('span', { className: 'badge badge-info', text: d.orderStatus }),
    ])
  ));
}

async function handleLogout() {
  try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); }
  catch { toast.error('Gagal keluar.'); }
}
