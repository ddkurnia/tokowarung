// ============================================
// TokoWarung — Review Service (Phase 5)
// ============================================
// Buyer dapat memberikan rating untuk: Seller, Product, Courier.
// Rating 1-5 stars + komentar. Anti-manipulasi: hanya 1 review per order per target.
// ============================================

import { db } from '../firebase/config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { COLLECTION, ORDER_STATUS } from '../utils/constants.js';

const REVIEW_TARGETS = ['PRODUCT', 'SELLER', 'COURIER'];

/**
 * Create review (buyer only, after order DELIVERED).
 * Anti-abuse: cek apakah buyer sudah pernah review target ini untuk order ini.
 *
 * @param {object} param
 * @param {string} param.buyerId
 * @param {string} param.orderId
 * @param {string} param.targetType - PRODUCT | SELLER | COURIER
 * @param {string} param.targetId - productId / sellerId / courierId
 * @param {number} param.rating - 1 to 5
 * @param {string} param.comment - text review
 */
export async function createReview({ buyerId, orderId, targetType, targetId, rating, comment = '' }) {
  if (!buyerId) throw new Error('Buyer ID wajib diisi.');
  if (!REVIEW_TARGETS.includes(targetType)) throw new Error('Target type tidak valid.');
  if (!targetId) throw new Error('Target ID wajib diisi.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating harus 1-5.');
  if (comment.length > 500) throw new Error('Komentar maksimal 500 karakter.');

  // Verify order status = DELIVERED
  const orderSnap = await getDoc(doc(db, COLLECTION.ORDERS, orderId));
  if (!orderSnap.exists()) throw new Error('Order tidak ditemukan.');
  const order = orderSnap.data();
  if (order.buyerId !== buyerId) throw new Error('Order ini bukan milikmu.');
  if (order.orderStatus !== ORDER_STATUS.DELIVERED) {
    throw new Error('Order harus selesai (DELIVERED) untuk di-review.');
  }

  // Anti-abuse: cek apakah sudah review
  const existingQuery = query(
    collection(db, COLLECTION.REVIEWS),
    where('buyerId', '==', buyerId),
    where('orderId', '==', orderId),
    where('targetType', '==', targetType),
    where('targetId', '==', targetId),
    limit(1)
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) throw new Error('Kamu sudah review ini untuk order ini.');

  // Create review
  const ref = await addDoc(collection(db, COLLECTION.REVIEWS), {
    buyerId,
    orderId,
    targetType,
    targetId,
    rating,
    comment,
    sellerId: targetType === 'PRODUCT' ? order.sellerId : (targetType === 'SELLER' ? targetId : null),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Update target's rating (seller/product/courier)
  await updateTargetRating(targetType, targetId, rating);

  return { reviewId: ref.id };
}

/**
 * Update target rating (seller/product/courier).
 * Recalculate: rating = (currentTotal * currentAvg + newRating) / (currentTotal + 1)
 */
async function updateTargetRating(targetType, targetId, newRating) {
  let collectionName, docId;
  if (targetType === 'SELLER') { collectionName = COLLECTION.SELLERS; docId = targetId; }
  else if (targetType === 'COURIER') { collectionName = COLLECTION.COURIERS; docId = targetId; }
  else if (targetType === 'PRODUCT') { collectionName = COLLECTION.PRODUCTS; docId = targetId; }
  else return;

  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, {
    rating: increment(newRating), // akan dibagi saat display
    totalRatings: increment(1),
    updatedAt: serverTimestamp(),
  });

  // Catatan: rating field sekarang = sum of all ratings. Average = rating / totalRatings.
  // Di display, kita pakai: (rating / totalRatings).toFixed(1)
  // TODO Phase 5.5: kalau sudah Blaze, pindah ke Cloud Function untuk proper recompute.
}

/**
 * Get reviews for a target (product/seller/courier).
 */
export async function getTargetReviews(targetType, targetId, opts = {}) {
  const { pageSize = 20, cursor } = opts;
  const q = query(
    collection(db, COLLECTION.REVIEWS),
    where('targetType', '==', targetType),
    where('targetId', '==', targetId),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Get product reviews (shortcut).
 */
export async function getProductReviews(productId, opts = {}) {
  return getTargetReviews('PRODUCT', productId, opts);
}

/**
 * Get seller reviews.
 */
export async function getSellerReviews(sellerId, opts = {}) {
  return getTargetReviews('SELLER', sellerId, opts);
}

/**
 * Get rating summary (distribution: 5★, 4★, 3★, 2★, 1★).
 */
export async function getRatingSummary(targetType, targetId) {
  const snap = await getDocs(query(
    collection(db, COLLECTION.REVIEWS),
    where('targetType', '==', targetType),
    where('targetId', '==', targetId),
    limit(1000)
  ));
  const reviews = snap.docs.map((d) => d.data());
  const total = reviews.length;
  const sum = reviews.reduce((s, r) => s + (r.rating || 0), 0);
  const avg = total > 0 ? sum / total : 0;
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const rating = r.rating || 0;
    if (rating >= 1 && rating <= 5) distribution[rating]++;
  });
  return { total, average: avg, distribution };
}

/**
 * Get buyer's pending reviews (orders DELIVERED but not yet reviewed).
 */
export async function getBuyerPendingReviews(buyerId, opts = {}) {
  if (!buyerId) return { items: [] };
  const { pageSize = 20 } = opts;
  // Fetch buyer's DELIVERED orders
  const ordersQuery = query(
    collection(db, COLLECTION.ORDERS),
    where('buyerId', '==', buyerId),
    where('orderStatus', '==', ORDER_STATUS.DELIVERED),
    orderBy('timestamps.createdAt', 'desc'),
    limit(pageSize)
  );
  const ordersSnap = await getDocs(ordersQuery);
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // For each order, check if reviewed
  const pending = [];
  for (const order of orders) {
    // Check seller review
    const sellerRevSnap = await getDocs(query(
      collection(db, COLLECTION.REVIEWS),
      where('buyerId', '==', buyerId),
      where('orderId', '==', order.id),
      where('targetType', '==', 'SELLER'),
      limit(1)
    ));
    if (sellerRevSnap.empty) {
      pending.push({ orderId: order.id, targetType: 'SELLER', targetId: order.sellerId, targetName: order.sellerName || 'Toko' });
    }
    // Check courier review (if assigned)
    if (order.courierId) {
      const courierRevSnap = await getDocs(query(
        collection(db, COLLECTION.REVIEWS),
        where('buyerId', '==', buyerId),
        where('orderId', '==', order.id),
        where('targetType', '==', 'COURIER'),
        limit(1)
      ));
      if (courierRevSnap.empty) {
        pending.push({ orderId: order.id, targetType: 'COURIER', targetId: order.courierId, targetName: 'Kurir' });
      }
    }
  }

  return { items: pending };
}
