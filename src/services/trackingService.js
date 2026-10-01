// ============================================
// TokoWarung — Live Tracking Service (Phase 7)
// ============================================
// Courier location tracking during delivery.
// Periodic update (every 30s) — battery-efficient.
// Realtime subscription for buyer/admin to see courier on map.
// ============================================

import { db, isFirebaseConfigured } from '../firebase/config.js';
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { COLLECTION, COURIER_STATUS } from '../utils/constants.js';

const UPDATE_INTERVAL_MS = 30000; // 30 seconds

let trackingInterval = null;
let lastLocation = null;

/**
 * Start periodic location updates for courier (during delivery).
 * Called when courier status = DELIVERING.
 *
 * @param {string} courierId
 * @returns {() => void} stop function
 */
export function startLocationTracking(courierId) {
  if (!courierId || !isFirebaseConfigured()) return () => {};
  if (trackingInterval) return () => stopLocationTracking();

  // Get initial location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        updateCourierLocation(courierId, lastLocation);
      },
      (err) => console.warn('[tracking] Geolocation error:', err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Periodic update
    trackingInterval = setInterval(() => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          lastLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          updateCourierLocation(courierId, lastLocation);
        },
        (err) => console.warn('[tracking] Periodic geolocation error:', err.message),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 25000 }
      );
    }, UPDATE_INTERVAL_MS);

    // Watch position for more responsive updates
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Only update if moved >50 meters
        if (lastLocation) {
          const dist = haversineKm(lastLocation.lat, lastLocation.lng, newLoc.lat, newLoc.lng) * 1000;
          if (dist < 50) return; // skip if < 50m movement
        }
        lastLocation = newLoc;
        updateCourierLocation(courierId, newLoc);
      },
      (err) => console.warn('[tracking] Watch error:', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    return () => {
      stopLocationTracking();
      navigator.geolocation.clearWatch(watchId);
    };
  }

  return () => stopLocationTracking();
}

/**
 * Stop location tracking.
 */
export function stopLocationTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
}

/**
 * Update courier location in Firestore.
 */
async function updateCourierLocation(courierId, location) {
  if (!courierId || !location) return;
  try {
    await updateDoc(doc(db, COLLECTION.COURIERS, courierId), {
      currentLocation: location,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[tracking] Failed to update location:', err.message);
  }
}

/**
 * Subscribe to courier location (realtime).
 * Used by buyer to see courier on map during delivery.
 *
 * @param {string} courierId
 * @param {(location) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeToCourierLocation(courierId, cb) {
  if (!courierId || !isFirebaseConfigured()) return () => {};
  return onSnapshot(
    doc(db, COLLECTION.COURIERS, courierId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const data = snap.data();
      cb({
        location: data.currentLocation,
        isOnline: data.isOnline,
        status: data.status,
        lastSeenAt: data.lastSeenAt,
        fullName: data.fullName,
        vehicleType: data.vehicleType,
      });
    },
    (err) => console.error('[tracking] Location snapshot error:', err)
  );
}

/**
 * Get all online couriers (for admin operational map).
 */
export async function getOnlineCouriers() {
  if (!isFirebaseConfigured()) return [];
  const q = query(
    collection(db, COLLECTION.COURIERS),
    where('isOnline', '==', true),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to all online couriers (realtime for admin map).
 */
export function subscribeToOnlineCouriers(cb) {
  if (!isFirebaseConfigured()) return () => {};
  const q = query(
    collection(db, COLLECTION.COURIERS),
    where('isOnline', '==', true),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('[tracking] Couriers snapshot error:', err));
}

/**
 * Subscribe to active deliveries (orders with courier assigned, not yet DELIVERED).
 */
export function subscribeToActiveDeliveries(cb) {
  if (!isFirebaseConfigured()) return () => {};
  const q = query(
    collection(db, COLLECTION.ORDERS),
    where('orderStatus', 'in', ['COURIER_ASSIGNED', 'COURIER_GOING_TO_PICKUP', 'PICKED_UP', 'DELIVERING', 'ARRIVED']),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('[tracking] Active deliveries snapshot error:', err));
}

// ----- Haversine helper -----
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
