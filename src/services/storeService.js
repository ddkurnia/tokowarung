// ============================================
// TokoWarung — Store Service
// Public store page, seller profile, search store.
// ============================================

import { db } from '../firebase/config.js';
import { collection, doc, getDoc, getDocs, query, where, limit, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { COLLECTION, SELLER_VERIFICATION } from '../utils/constants.js';

/**
 * Get public store info by sellerId (VERIFIED only).
 */
export async function getPublicStore(sellerId) {
  if (!sellerId) return null;
  const snap = await getDoc(doc(db, COLLECTION.SELLERS, sellerId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.verificationStatus !== SELLER_VERIFICATION.VERIFIED) return null;
  // Strip sensitive fields
  const { identityNumber, bankAccount, documents, ...publicData } = data;
  return { id: snap.id, ...publicData };
}

/**
 * Get seller profile for the dashboard (own data).
 */
export async function getSellerProfile(uid) {
  const snap = await getDoc(doc(db, COLLECTION.SELLERS, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Update seller profile (own data).
 * Field sensitif seperti bankAccount tidak boleh diupdate dari sini (harus via Cloud Function).
 */
export async function updateSellerProfile(uid, patch) {
  const forbidden = ['identityNumber', 'bankAccount', 'documents', 'verificationStatus', 'violationLevel', 'violationScore'];
  for (const f of forbidden) delete patch[f];
  patch.updatedAt = serverTimestamp();
  await updateDoc(doc(db, COLLECTION.SELLERS, uid), patch);
  return { id: uid, ...patch };
}

/**
 * List nearby stores based on buyer location (MVP: simple radius filter).
 * TODO: production-scale geo-query pakai GeoHash atau algolia Places.
 */
export async function listNearbyStores({ lat, lng, radiusKm = 10, limit: maxLimit = 20 }) {
  if (lat == null || lng == null) {
    // Fallback: return all verified stores
    const q = query(
      collection(db, COLLECTION.SELLERS),
      where('verificationStatus', '==', SELLER_VERIFICATION.VERIFIED),
      limit(maxLimit)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // MVP: over-fetch + client filter
  const q = query(
    collection(db, COLLECTION.SELLERS),
    where('verificationStatus', '==', SELLER_VERIFICATION.VERIFIED),
    limit(200)
  );
  const snap = await getDocs(q);
  const stores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return stores
    .filter((s) => {
      if (!s.location) return false;
      const d = haversineKm(lat, lng, s.location.lat, s.location.lng);
      return d <= radiusKm;
    })
    .map((s) => ({ ...s, distanceKm: haversineKm(lat, lng, s.location.lat, s.location.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxLimit);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
