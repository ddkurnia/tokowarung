// ============================================
// TokoWarung — Reusable Map Component (Leaflet)
// ============================================
// Lightweight wrapper around Leaflet + OpenStreetMap.
// Supports: markers, live tracking, routes.
// ============================================

import { el } from './ui.js';

let leafletLoaded = false;
let leafletCSSLoaded = false;

/**
 * Load Leaflet CSS (once).
 */
function loadLeafletCSS() {
  if (leafletCSSLoaded) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  leafletCSSLoaded = true;
}

/**
 * Load Leaflet JS dynamically (once).
 */
async function loadLeaflet() {
  if (leafletLoaded || window.L) {
    leafletLoaded = true;
    return window.L;
  }
  loadLeafletCSS();
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      leafletLoaded = true;
      resolve(window.L);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.L;
}

/**
 * Create a map container.
 * @param {object} opts
 * @param {number} opts.lat - center lat
 * @param {number} opts.lng - center lng
 * @param {number} opts.zoom - default 13
 * @param {number} opts.height - px, default 300
 * @param {Array} opts.markers - [{lat, lng, label, icon, popup}]
 * @param {Array} opts.route - [[lat,lng], [lat,lng], ...] for polyline
 * @param {boolean} opts.liveTrack - if true, watch for marker position changes
 * @returns {Promise<HTMLElement>} map container element
 */
export async function createMap(opts = {}) {
  const { lat = -6.2, lng = 106.8, zoom = 13, height = 300, markers = [], route = null, liveTrack = false } = opts;

  const container = el('div', {
    className: 'map-container',
    attrs: { 'aria-label': 'Map' },
    style: { width: '100%', height: height + 'px', borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative' },
  });

  // Load Leaflet
  try {
    const L = await loadLeaflet();

    // Wait for container to be in DOM
    await new Promise((r) => setTimeout(r, 100));

    // Create map
    const map = L.map(container).setView([lat, lng], zoom);

    // Tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Add markers
    const markerObjects = [];
    markers.forEach((m) => {
      if (!m.lat || !m.lng) return;
      const marker = L.marker([m.lat, m.lng]).addTo(map);
      if (m.popup) marker.bindPopup(m.popup);
      if (m.label) marker.bindTooltip(m.label, { permanent: false });
      markerObjects.push({ marker, data: m });
    });

    // Add route (polyline)
    if (route && route.length >= 2) {
      L.polyline(route, { color: 'var(--color-primary)', weight: 3, opacity: 0.7 }).addTo(map);
    }

    // Fit bounds if markers exist
    if (markerObjects.length > 0) {
      const bounds = L.latLngBounds(markerObjects.map((m) => [m.data.lat, m.data.lng]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }

    // Store map instance for updates
    container._map = map;
    container._L = L;
    container._markers = markerObjects;

    // Fix: Leaflet needs invalidateSize after container is visible
    setTimeout(() => map.invalidateSize(), 200);

    return container;
  } catch (err) {
    console.error('[map] Failed to load Leaflet:', err);
    container.replaceChildren(
      el('div', { className: 'empty-state', style: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [
        el('p', { className: 'text-sm text-muted', text: 'Gagal memuat peta. Refresh halaman.' }),
      ])
    );
    return container;
  }
}

/**
 * Update a marker position on existing map (for live tracking).
 */
export function updateMapMarker(mapContainer, markerIndex, lat, lng) {
  if (!mapContainer?._map || !mapContainer?._markers?.[markerIndex]) return;
  const { marker } = mapContainer._markers[markerIndex];
  marker.setLatLng([lat, lng]);
  mapContainer._map.panTo([lat, lng]);
}

/**
 * Add a new marker to existing map.
 */
export function addMapMarker(mapContainer, lat, lng, popup = null, label = null) {
  if (!mapContainer?._map || !mapContainer?._L) return null;
  const L = mapContainer._L;
  const marker = L.marker([lat, lng]).addTo(mapContainer._map);
  if (popup) marker.bindPopup(popup);
  if (label) marker.bindTooltip(label);
  mapContainer._markers.push({ marker, data: { lat, lng, popup, label } });
  return marker;
}

/**
 * Clear all markers from map.
 */
export function clearMapMarkers(mapContainer) {
  if (!mapContainer?._map || !mapContainer?._markers) return;
  mapContainer._markers.forEach(({ marker }) => {
    mapContainer._map.removeLayer(marker);
  });
  mapContainer._markers = [];
}
