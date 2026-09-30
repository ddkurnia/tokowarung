// ============================================
// TokoWarung — Courier Service
// Online/offline toggle, current location update, courier profile.
// ============================================

import { db, isFirebaseConfigured } from '../firebase/config.js';
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { COLLECTION, COURIER_STATUS } from '../utils/constants.js';

// ----- Local cache (untuk reaktivitasitas sederhana) -----
const listeners = new Set();
let currentCourierProfile = null;

function notify() {
  for (const fn of listeners) {
    try { fn(currentCourierProfile); } catch (e) { console.error('[courierService] listener error:', e); }
  }
}

/**
 * Subscribe ke profile courier realtime (untuk online status, dll).
 * @param {string} courierId - uid user courier
 * @param {(profile) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeToCourierProfile(courierId, cb) {
  if (!courierId || !isFirebaseConfigured()) return () => {};
  listeners.add(cb);
  // Immediately notify with cached value
  if (currentCourierProfile) cb(currentCourierProfile);

  const ref = doc(db, COLLECTION.COURIERS, courierId);
  const unsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      currentCourierProfile = null;
    } else {
      currentCourierProfile = { id: snap.id, ...snap.data() };
    }
    notify();
  }, (err) => {
    console.error('[courierService] snapshot error:', err);
  });

  const wrappedUnsub = () => {
    unsub();
    listeners.delete(cb);
  };
  return wrappedUnsub;
}

/**
 * Set courier online/offline.
 * @param {string} courierId
 * @param {boolean} isOnline
 * @param {object} location - { lat, lng } optional
 */
export async function setOnline(courierId, isOnline, location = null) {
  if (!courierId) throw new Error('Courier ID wajib diisi.');
  if (!isFirebaseConfigured()) throw new Error('Firebase belum dikonfigurasi.');

  const ref = doc(db, COLLECTION.COURIERS, courierId);
  const patch = {
    isOnline,
    status: isOnline ? COURIER_STATUS.ONLINE_AVAILABLE : COURIER_STATUS.OFFLINE,
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    patch.currentLocation = location;
  }
  await updateDoc(ref, patch);
  return { isOnline, status: patch.status };
}

/**
 * Update courier location (saat online & sedang delivery).
 * @param {string} courierId
 * @param {{lat: number, lng: number}} location
 */
export async function updateLocation(courierId, location) {
  if (!courierId || !location) throw new Error('Parameter tidak valid.');
  if (!isFirebaseConfigured()) throw new Error('Firebase belum dikonfigurasi.');
  await updateDoc(doc(db, COLLECTION.COURIERS, courierId), {
    currentLocation: location,
    lastSeenAt: serverTimestamp(),
  });
}

/**
 * Get courier profile (one-time fetch).
 */
export async function getCourierProfile(courierId) {
  if (!courierId) return null;
  const snap = await getDoc(doc(db, COLLECTION.COURIERS, courierId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
