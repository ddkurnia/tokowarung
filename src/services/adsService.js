// ============================================
// TokoWarung — Ads Service (Phase 5 - foundation only)
// ============================================
// Seller buat campaign: product, budget, duration, target location.
// Track impressions, clicks, orders, revenue.
// No bidding system (flat rate per impression).
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
import { COLLECTION } from '../utils/constants.js';

const CAMPAIGN_STATUS = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED'];

/**
 * Create ads campaign (seller).
 *
 * @param {object} param
 * @param {string} param.sellerId
 * @param {string} param.productId - produk yang di-promote
 * @param {string} param.campaignName
 * @param {number} param.budget - total budget dalam rupiah
 * @param {number} param.bidPerImpression - biaya per impression (default 50 IDR)
 * @param {Date|string} param.startDate
 * @param {Date|string} param.endDate
 * @param {object} param.targetLocation - { lat, lng, radiusKm }
 */
export async function createCampaign({ sellerId, productId, campaignName, budget, bidPerImpression = 50, startDate, endDate, targetLocation = null }) {
  if (!sellerId) throw new Error('Seller ID wajib diisi.');
  if (!productId) throw new Error('Product ID wajib diisi.');
  if (!campaignName || campaignName.length < 5) throw new Error('Nama campaign min 5 karakter.');
  if (!budget || budget < 5000) throw new Error('Budget minimum Rp 5.000.');
  if (!startDate || !endDate) throw new Error('Start & end date wajib diisi.');

  const ref = await addDoc(collection(db, COLLECTION.ADS), {
    sellerId,
    productId,
    campaignName,
    budget,
    bidPerImpression,
    spentAmount: 0,
    impressions: 0,
    clicks: 0,
    orders: 0,
    revenue: 0,
    startDate,
    endDate,
    targetLocation,
    status: 'PENDING_APPROVAL',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { campaignId: ref.id };
}

/**
 * Admin: approve ads campaign.
 */
export async function approveCampaign(campaignId, adminId) {
  await updateDoc(doc(db, COLLECTION.ADS, campaignId), {
    status: 'ACTIVE',
    approvedBy: adminId,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin: reject ads campaign.
 */
export async function rejectCampaign(campaignId, adminId, reason = '') {
  await updateDoc(doc(db, COLLECTION.ADS, campaignId), {
    status: 'REJECTED',
    rejectedBy: adminId,
    rejectionReason: reason,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Seller: pause/resume own campaign.
 */
export async function toggleCampaignPause(campaignId, sellerId, pause = true) {
  const snap = await getDoc(doc(db, COLLECTION.ADS, campaignId));
  if (!snap.exists()) throw new Error('Campaign tidak ditemukan.');
  const c = snap.data();
  if (c.sellerId !== sellerId) throw new Error('Bukan milikmu.');

  await updateDoc(doc(db, COLLECTION.ADS, campaignId), {
    status: pause ? 'PAUSED' : 'ACTIVE',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Track impression (called when ad is shown to buyer).
 * Auto-stop campaign jika budget habis.
 */
export async function trackImpression(campaignId) {
  const ref = doc(db, COLLECTION.ADS, campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const c = snap.data();
  if (c.status !== 'ACTIVE') return;
  if (c.spentAmount + c.bidPerImpression > c.budget) {
    // Budget exceeded — auto-complete
    await updateDoc(ref, {
      status: 'COMPLETED',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(ref, {
    impressions: increment(1),
    spentAmount: increment(c.bidPerImpression),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Track click (called when buyer clicks on ad).
 */
export async function trackClick(campaignId) {
  await updateDoc(doc(db, COLLECTION.ADS, campaignId), {
    clicks: increment(1),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Track conversion (called when buyer places order with promoted product).
 */
export async function trackConversion(campaignId, orderId, revenue) {
  await updateDoc(doc(db, COLLECTION.ADS, campaignId), {
    orders: increment(1),
    revenue: increment(revenue),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, COLLECTION.ADS), {
    type: 'CONVERSION_LOG',
    campaignId,
    orderId,
    revenue,
    timestamp: serverTimestamp(),
  });
}

/**
 * Get active campaigns (for showing ads to buyer).
 * Priority: budget most remaining first.
 */
export async function getActiveCampaigns(opts = {}) {
  const { pageSize = 5 } = opts;
  const q = query(
    collection(db, COLLECTION.ADS),
    where('status', '==', 'ACTIVE'),
    limit(pageSize * 2) // over-fetch, client filter
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => (c.budget - (c.spentAmount || 0)) >= (c.bidPerImpression || 50))
    .slice(0, pageSize);
}

/**
 * List seller's campaigns.
 */
export async function listSellerCampaigns(sellerId, opts = {}) {
  if (!sellerId) return { items: [] };
  const { pageSize = 30 } = opts;
  const q = query(
    collection(db, COLLECTION.ADS),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

/**
 * List pending approval campaigns (admin queue).
 */
export async function listPendingCampaigns(opts = {}) {
  const { pageSize = 20 } = opts;
  const q = query(
    collection(db, COLLECTION.ADS),
    where('status', '==', 'PENDING_APPROVAL'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}
