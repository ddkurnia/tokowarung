// ============================================
// TokoWarung — Fraud Detection Service (Phase 6)
// ============================================
// Composite riskScore: LOW / MEDIUM / HIGH / CRITICAL
// Single signal TIDAK boleh langsung block — pakai composite score.
// ============================================

import { db } from '../firebase/config.js';
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { COLLECTION, RISK_LEVEL, ORDER_STATUS, PAYMENT_METHOD } from '../utils/constants.js';

const RISK_SIGNALS = {
  // Account signals
  NEW_ACCOUNT: 5,
  NO_VERIFICATION: 10,
  // Order signals
  HIGH_VALUE_COD: 15,
  RAPID_ORDERS: 10,
  MULTIPLE_CANCELLED: 10,
  // Voucher signals
  VOUCHER_ABUSE: 20,
  // Payment signals
  PAYMENT_FAIL_REPEATED: 15,
  // Review signals
  FAKE_REVIEW_PATTERN: 10,
  // COD signals
  COD_NOT_SETTLED: 25,
};

/**
 * Calculate risk score for a user based on multiple signals.
 * Returns composite score + risk level + signal breakdown.
 */
export async function calculateRiskScore(userId) {
  if (!userId) return null;

  const signals = [];

  // 1. Account data
  const userSnap = await getDocs(query(collection(db, COLLECTION.USERS), where('uid', '==', userId), limit(1)));
  const user = userSnap.docs[0]?.data();
  if (!user) return null;

  // New account (< 24 hours)
  const createdAt = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
  const accountAgeHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (accountAgeHours < 24) {
    signals.push({ signal: 'NEW_ACCOUNT', score: RISK_SIGNALS.NEW_ACCOUNT, detail: `Account ${accountAgeHours.toFixed(1)} hours old` });
  }

  // Not verified (kalau SELLER atau COURIER)
  if (user.role === 'SELLER' || user.role === 'COURIER') {
    const collName = user.role === 'SELLER' ? COLLECTION.SELLERS : COLLECTION.COURIERS;
    const profileSnap = await getDocs(query(collection(db, collName), where('uid', '==', userId), limit(1)));
    const profile = profileSnap.docs[0]?.data();
    if (profile && profile.verificationStatus && profile.verificationStatus !== 'VERIFIED') {
      signals.push({ signal: 'NO_VERIFICATION', score: RISK_SIGNALS.NO_VERIFICATION, detail: `${user.role} not verified: ${profile.verificationStatus}` });
    }
  }

  // 2. Order history
  const ordersSnap = await getDocs(query(collection(db, COLLECTION.ORDERS), where('buyerId', '==', userId), limit(1000)));
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // High-value COD orders (> Rp 500K each, multiple)
  const highValueCOD = orders.filter((o) => o.paymentMethod === PAYMENT_METHOD.COD && o.total > 500000);
  if (highValueCOD.length >= 2) {
    signals.push({ signal: 'HIGH_VALUE_COD', score: RISK_SIGNALS.HIGH_VALUE_COD, detail: `${highValueCOD.length} high-value COD orders (each >Rp 500K)` });
  }

  // Rapid orders (>5 orders in 24 hours)
  const last24h = new Date(); last24h.setHours(last24h.getHours() - 24);
  const recentOrders = orders.filter((o) => {
    const cAt = o.timestamps?.createdAt?.toDate ? o.timestamps.createdAt.toDate() : new Date(o.timestamps?.createdAt);
    return cAt >= last24h;
  });
  if (recentOrders.length >= 5) {
    signals.push({ signal: 'RAPID_ORDERS', score: RISK_SIGNALS.RAPID_ORDERS, detail: `${recentOrders.length} orders in 24h` });
  }

  // Multiple cancelled orders
  const cancelled = orders.filter((o) => o.orderStatus === ORDER_STATUS.CANCELLED);
  if (cancelled.length >= 3) {
    signals.push({ signal: 'MULTIPLE_CANCELLED', score: RISK_SIGNALS.MULTIPLE_CANCELLED, detail: `${cancelled.length} cancelled orders` });
  }

  // 3. Voucher abuse (kalau user pakai voucher berulang untuk cancel)
  const voucherUsagesSnap = await getDocs(query(collection(db, COLLECTION.TRANSACTIONS), where('userId', '==', userId), where('type', '==', 'VOUCHER_USAGE'), limit(50)));
  const voucherUsageCount = voucherUsagesSnap.size;
  if (voucherUsageCount >= 5) {
    // Check how many had orders cancelled after voucher applied
    const voucherOrderIds = voucherUsagesSnap.docs.map((d) => d.data().orderId);
    const voucherCancelled = cancelled.filter((o) => voucherOrderIds.includes(o.id));
    if (voucherCancelled.length >= 2) {
      signals.push({ signal: 'VOUCHER_ABUSE', score: RISK_SIGNALS.VOUCHER_ABUSE, detail: `${voucherCancelled.length} orders cancelled after voucher applied` });
    }
  }

  // 4. Failed payments
  const failedPaymentsSnap = await getDocs(query(collection(db, COLLECTION.PAYMENTS), where('buyerId', '==', userId), where('status', '==', 'FAILED'), limit(20)));
  if (failedPaymentsSnap.size >= 3) {
    signals.push({ signal: 'PAYMENT_FAIL_REPEATED', score: RISK_SIGNALS.PAYMENT_FAIL_REPEATED, detail: `${failedPaymentsSnap.size} failed payments` });
  }

  // 5. Review pattern (kalau user kirim banyak 1★ reviews)
  const reviewsSnap = await getDocs(query(collection(db, COLLECTION.REVIEWS), where('buyerId', '==', userId), limit(100)));
  const oneStarReviews = reviewsSnap.docs.filter((d) => d.data().rating === 1);
  if (oneStarReviews.length >= 3) {
    signals.push({ signal: 'FAKE_REVIEW_PATTERN', score: RISK_SIGNALS.FAKE_REVIEW_PATTERN, detail: `${oneStarReviews.length} one-star reviews (potential extortion)` });
  }

  // 6. COD not settled (untuk COURIER role)
  if (user.role === 'COURIER') {
    const walletSnap = await getDocs(query(collection(db, COLLECTION.COURIER_WALLETS), where('uid', '==', userId), limit(1)));
    const wallet = walletSnap.docs[0]?.data();
    if (wallet && (wallet.codOutstanding || 0) > 100000) {
      signals.push({ signal: 'COD_NOT_SETTLED', score: RISK_SIGNALS.COD_NOT_SETTLED, detail: `COD outstanding: Rp ${(wallet.codOutstanding || 0).toLocaleString('id-ID')}` });
    }
  }

  // Calculate total score
  const totalScore = signals.reduce((s, sig) => s + sig.score, 0);

  // Determine risk level
  let level = RISK_LEVEL.LOW;
  if (totalScore >= 50) level = RISK_LEVEL.CRITICAL;
  else if (totalScore >= 30) level = RISK_LEVEL.HIGH;
  else if (totalScore >= 15) level = RISK_LEVEL.MEDIUM;

  return {
    userId,
    totalScore,
    level,
    signals,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Get all users with HIGH or CRITICAL risk (scan all users, calc score).
 * Catatan: O(n) operation — for high user count, ideally via Cloud Function.
 */
export async function getHighRiskUsers(opts = {}) {
  const { pageSize = 50 } = opts;
  const usersSnap = await getDocs(query(collection(db, COLLECTION.USERS), limit(pageSize)));
  const results = [];

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    try {
      const risk = await calculateRiskScore(userId);
      if (risk && (risk.level === RISK_LEVEL.HIGH || risk.level === RISK_LEVEL.CRITICAL)) {
        results.push({ ...risk, user: { id: userId, ...userDoc.data() } });
      }
    } catch (err) {
      console.warn(`[fraud] Failed to calc score for ${userId}:`, err.message);
    }
  }

  return {
    items: results.sort((a, b) => b.totalScore - a.totalScore),
  };
}

/**
 * Detect duplicate accounts (same phone or similar displayName).
 * Returns list of suspected duplicates.
 */
export async function detectDuplicateAccounts() {
  const usersSnap = await getDocs(query(collection(db, COLLECTION.USERS), limit(1000)));
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Group by phone
  const byPhone = {};
  users.forEach((u) => {
    if (!u.phone) return;
    if (!byPhone[u.phone]) byPhone[u.phone] = [];
    byPhone[u.phone].push(u);
  });

  // Find phones with multiple accounts
  const duplicates = [];
  Object.entries(byPhone).forEach(([phone, accounts]) => {
    if (accounts.length > 1) {
      duplicates.push({
        type: 'PHONE',
        key: phone,
        accounts: accounts.map((a) => ({ id: a.id, email: a.email, role: a.role, displayName: a.displayName })),
      });
    }
  });

  return { items: duplicates };
}
