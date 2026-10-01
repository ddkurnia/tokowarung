// ============================================
// TokoWarung — Violation Service (Phase 4)
// ============================================
// Seller violation system: WARNING → RESTRICTED → SUSPENDED → BANNED.
// Riwayat violation tidak bisa dihapus (audit permanent).
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
import { COLLECTION, VIOLATION_LEVEL } from '../utils/constants.js';

const VIOLATION_TYPES = [
  'PROHIBITED_PRODUCT',
  'FAKE_PRODUCT',
  'PRICE_MANIPULATION',
  'NO_SHIPMENT',
  'SELLER_FRAUD',
  'REPEATED_REPORTS',
  'POLICY_VIOLATION',
  'OTHER',
];

const VIOLATION_SCORE_MAP = {
  WARNING: 1,
  RESTRICTED: 5,
  SUSPENDED: 20,
  BANNED: 100,
};

/**
 * Add violation record (admin only — rules enforced).
 * Catatan: riwayat violation TIDAK BOLEH DIHAPUS.
 *
 * @param {string} sellerId
 * @param {string} adminId
 * @param {string} violationType - VIOLATION_TYPES
 * @param {string} description
 * @param {Array} evidence
 * @param {string} action - WARNING | RESTRICTED | SUSPENDED | BANNED
 * @param {string} productId - optional (jika violation terkait produk tertentu)
 */
export async function addViolation({ sellerId, adminId, violationType, description, evidence = [], action = VIOLATION_LEVEL.WARNING, productId = null }) {
  if (!sellerId) throw new Error('Seller ID wajib diisi.');
  if (!adminId) throw new Error('Admin ID wajib diisi.');
  if (!VIOLATION_TYPES.includes(violationType)) throw new Error('Violation type tidak valid.');
  if (!Object.values(VIOLATION_LEVEL).includes(action)) throw new Error('Action tidak valid.');
  if (!description || description.length < 10) throw new Error('Deskripsi minimal 10 karakter.');

  // 1. Create violation record (permanent, never deleted)
  const violationRef = await addDoc(collection(db, COLLECTION.VIOLATIONS), {
    sellerId,
    productId,
    violationType,
    description,
    evidence,
    action,
    score: VIOLATION_SCORE_MAP[action] || 1,
    adminId,
    resolved: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Update seller's violation score & level
  const sellerRef = doc(db, COLLECTION.SELLERS, sellerId);
  const sellerSnap = await getDoc(sellerRef);
  if (!sellerSnap.exists()) throw new Error('Seller tidak ditemukan.');
  const seller = sellerSnap.data();

  const newScore = (seller.violationScore || 0) + VIOLATION_SCORE_MAP[action];

  // Determine new level based on cumulative score
  let newLevel = seller.violationLevel || VIOLATION_LEVEL.WARNING;
  if (newScore >= 100) newLevel = VIOLATION_LEVEL.BANNED;
  else if (newScore >= 20) newLevel = VIOLATION_LEVEL.SUSPENDED;
  else if (newScore >= 5) newLevel = VIOLATION_LEVEL.RESTRICTED;

  // If explicit action is higher than auto-calculated, use the higher
  const explicitLevelRank = { WARNING: 1, RESTRICTED: 2, SUSPENDED: 3, BANNED: 4 };
  if (explicitLevelRank[action] > explicitLevelRank[newLevel]) {
    newLevel = action;
  }

  await updateDoc(sellerRef, {
    violationScore: newScore,
    violationLevel: newLevel,
    updatedAt: serverTimestamp(),
  });

  // 3. If SUSPENDED or BANNED, suspend all seller's products
  if (newLevel === VIOLATION_LEVEL.SUSPENDED || newLevel === VIOLATION_LEVEL.BANNED) {
    const productsQuery = query(
      collection(db, COLLECTION.PRODUCTS),
      where('sellerId', '==', sellerId),
      where('isActive', '==', true),
      limit(100)
    );
    const productsSnap = await getDocs(productsQuery);
    await Promise.all(productsSnap.docs.map((pSnap) =>
      updateDoc(pSnap.ref, {
        status: 'SUSPENDED',
        isActive: false,
        suspensionReason: `Seller ${newLevel} due to violations`,
        updatedAt: serverTimestamp(),
      })
    ));
  }

  // 4. Audit log
  await addDoc(collection(db, COLLECTION.AUDIT_LOGS), {
    actorId: adminId,
    action: 'VIOLATION_ADDED',
    target: sellerId,
    newValue: action,
    violationId: violationRef.id,
    note: description,
    timestamp: serverTimestamp(),
  });

  return { violationId: violationRef.id, newScore, newLevel };
}

/**
 * List violations for a seller.
 */
export async function listViolations(sellerId, opts = {}) {
  if (!sellerId) return { items: [] };
  const { pageSize = 50 } = opts;
  const q = query(
    collection(db, COLLECTION.VIOLATIONS),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    hasMore: snap.size === 50,
  };
}

/**
 * Admin: list all violations (across all sellers).
 */
export async function listAllViolations(opts = {}) {
  const { action, pageSize = 50, cursor } = opts;
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (action) constraints.unshift(where('action', '==', action));
  const q = query(collection(db, COLLECTION.VIOLATIONS), ...constraints);
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Get seller violation summary (utk seller dashboard display).
 */
export async function getSellerViolationSummary(sellerId) {
  if (!sellerId) return { score: 0, level: 'WARNING', history: [] };
  const sellerSnap = await getDoc(doc(db, COLLECTION.SELLERS, sellerId));
  if (!sellerSnap.exists()) return { score: 0, level: 'WARNING', history: [] };
  const seller = sellerSnap.data();
  const { items: history } = await listViolations(sellerId, { pageSize: 20 });
  return {
    score: seller.violationScore || 0,
    level: seller.violationLevel || 'WARNING',
    history,
  };
}

/**
 * Stats untuk admin dashboard.
 */
export async function getViolationStats() {
  const all = await getDocs(query(collection(db, COLLECTION.VIOLATIONS), limit(1000)));
  const docs = all.docs.map((d) => d.data());
  return {
    total: docs.length,
    warning: docs.filter((d) => d.action === VIOLATION_LEVEL.WARNING).length,
    restricted: docs.filter((d) => d.action === VIOLATION_LEVEL.RESTRICTED).length,
    suspended: docs.filter((d) => d.action === VIOLATION_LEVEL.SUSPENDED).length,
    banned: docs.filter((d) => d.action === VIOLATION_LEVEL.BANNED).length,
  };
}
