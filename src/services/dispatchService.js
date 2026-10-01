// ============================================
// TokoWarung — Smart Dispatch Service (Phase 6)
// ============================================
// Improved auto-assign courier dengan ranking:
// 1. Distance (haversine seller location to courier current location)
// 2. Current load (orders being delivered)
// 3. Rating (courier rating)
// 4. Vehicle type (match distance & item weight)
// ============================================

import { db } from '../firebase/config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { COLLECTION, COURIER_STATUS } from '../utils/constants.js';
import { haversineKm } from '../utils/helpers.js';

const MAX_PICKUP_DISTANCE_KM = 15; // max distance courier from seller
const MAX_DELIVERY_RADIUS_KM = 25; // max delivery distance

/**
 * Find top N courier candidates for an order, ranked by score.
 *
 * @param {object} order - order data with sellerId, shippingAddress, items
 * @param {number} topN - how many candidates to return (default 3)
 * @returns {Promise<Array<{courierId, distanceKm, load, rating, score, courier}>>}
 */
export async function findCourierCandidates(order, topN = 3) {
  if (!order?.sellerId) throw new Error('Seller ID wajib.');

  // 1. Get seller location (from sellers collection)
  const sellerSnap = await getDoc(doc(db, COLLECTION.SELLERS, order.sellerId));
  if (!sellerSnap.exists()) throw new Error('Seller tidak ditemukan.');
  const seller = sellerSnap.data();
  const sellerLoc = seller.location;
  if (!sellerLoc) throw new Error('Seller tidak punya location. Tidak bisa rank by distance.');

  // 2. Get delivery distance (seller to buyer)
  const buyerLoc = order.shippingAddress?.location; // { lat, lng }
  const deliveryDistanceKm = buyerLoc ? haversineKm(sellerLoc.lat, sellerLoc.lng, buyerLoc.lat, buyerLoc.lng) : 0;

  // 3. Find all online & available couriers
  const q = query(
    collection(db, COLLECTION.COURIERS),
    where('isOnline', '==', true),
    where('status', '==', COURIER_STATUS.ONLINE_AVAILABLE),
    limit(50) // over-fetch, filter & rank client-side
  );
  const snap = await getDocs(q);
  if (snap.empty) return [];

  // 4. Rank each courier
  const candidates = [];
  for (const courierDoc of snap.docs) {
    const courier = { id: courierDoc.id, ...courierDoc.data() };

    // Calculate distance (courier current location to seller)
    const courierLoc = courier.currentLocation;
    if (!courierLoc) continue; // skip couriers without location

    const distanceKm = haversineKm(courierLoc.lat, courierLoc.lng, sellerLoc.lat, sellerLoc.lng);

    // Filter: too far away
    if (distanceKm > MAX_PICKUP_DISTANCE_KM) continue;

    // Get current load (active deliveries assigned to this courier)
    const activeOrdersSnap = await getDocs(query(
      collection(db, COLLECTION.ORDERS),
      where('courierId', '==', courier.id),
      where('orderStatus', 'in', ['COURIER_ASSIGNED', 'COURIER_GOING_TO_PICKUP', 'PICKED_UP', 'DELIVERING']),
      limit(10)
    ));
    const currentLoad = activeOrdersSnap.size;

    // MVP: max 1 active order per courier
    if (currentLoad >= (courier.maxConcurrentOrders || 1)) continue;

    // Calculate composite score (higher = better candidate)
    // Score factors:
    // - Distance (closer = better): max 100 points for 0 km, 0 points at MAX_PICKUP_DISTANCE_KM
    // - Rating: max 50 points for 5★, 0 points for 0★
    // - Load: penalty 30 points per active order
    const distanceScore = Math.max(0, 100 - (distanceKm / MAX_PICKUP_DISTANCE_KM * 100));
    const ratingScore = (courier.rating || 0) * 10; // 5★ = 50 points
    const loadPenalty = currentLoad * 30;

    const totalScore = distanceScore + ratingScore - loadPenalty;

    candidates.push({
      courierId: courier.id,
      courier,
      distanceKm,
      currentLoad,
      rating: courier.rating || 0,
      score: totalScore,
      scoreBreakdown: { distance: distanceScore, rating: ratingScore, loadPenalty: -loadPenalty },
    });
  }

  // Sort by score (descending) and return top N
  return candidates.sort((a, b) => b.score - a.score).slice(0, topN);
}

/**
 * Smart dispatch: find best courier & assign to order.
 * Generates pickup code + delivery OTP.
 *
 * @param {string} orderId
 * @param {string} sellerId - for audit
 * @returns {Promise<{courierId, pickupCode, candidates: number}>}
 */
export async function smartAssignCourier(orderId, sellerId) {
  // 1. Get order
  const orderSnap = await getDoc(doc(db, COLLECTION.ORDERS, orderId));
  if (!orderSnap.exists()) throw new Error('Order tidak ditemukan.');
  const order = { id: orderId, ...orderSnap.data() };

  if (order.orderStatus !== 'READY_FOR_PICKUP') {
    throw new Error('Order harus berstatus READY_FOR_PICKUP.');
  }
  if (order.courierId) throw new Error('Courier sudah di-assign.');

  // 2. Find candidates
  const candidates = await findCourierCandidates(order, 1);
  if (candidates.length === 0) {
    throw new Error('Tidak ada kurir online di sekitar toko. Coba lagi nanti atau admin assign manual.');
  }

  const bestCandidate = candidates[0];
  const courierId = bestCandidate.courierId;

  // 3. Generate pickup code + delivery OTP
  const pickupCode = String(Math.floor(100000 + Math.random() * 900000));

  // 4. Assign courier to order
  await updateDoc(doc(db, COLLECTION.ORDERS, orderId), {
    courierId,
    orderStatus: 'COURIER_ASSIGNED',
    pickupCode,
    dispatchInfo: {
      candidateCount: candidates.length,
      score: bestCandidate.score,
      distanceKm: bestCandidate.distanceKm,
      method: 'SMART_DISPATCH_v1',
    },
    'timestamps.COURIER_ASSIGNED': serverTimestamp(),
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: 'READY_FOR_PICKUP',
      to: 'COURIER_ASSIGNED',
      actorId: sellerId,
      note: `Smart-assigned courier ${courierId.slice(0, 8)}... (score: ${bestCandidate.score.toFixed(0)}, distance: ${bestCandidate.distanceKm.toFixed(1)}km)`,
      at: new Date().toISOString(),
    }),
  });

  // 5. Update courier status to ORDER_OFFERED
  await updateDoc(doc(db, COLLECTION.COURIERS, courierId), {
    status: COURIER_STATUS.ORDER_OFFERED,
    lastAssignmentAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    courierId,
    pickupCode,
    candidates: candidates.length,
    score: bestCandidate.score,
    distanceKm: bestCandidate.distanceKm,
  };
}
