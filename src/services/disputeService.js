// ============================================
// TokoWarung — Dispute Service (Phase 4)
// ============================================
// Disputes: Buyer vs Seller, Buyer vs Courier.
// Ticket-based dengan participants, messages, evidence, resolution.
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
  startAfter,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { COLLECTION } from '../utils/constants.js';

const DISPUTE_TYPES = ['BUYER_VS_SELLER', 'BUYER_VS_COURIER', 'SELLER_VS_COURIER'];
const DISPUTE_STATUS = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'];

/**
 * Create new dispute (ticket).
 */
export async function createDispute({ initiatorId, type, orderId, counterpartyId, reason, description = '', evidence = [] }) {
  if (!initiatorId) throw new Error('Initiator ID wajib diisi.');
  if (!DISPUTE_TYPES.includes(type)) throw new Error(`Type tidak valid. Pilih: ${DISPUTE_TYPES.join(', ')}`);
  if (!orderId) throw new Error('Order ID wajib diisi.');
  if (!counterpartyId) throw new Error('Counterparty ID wajib diisi.');

  const participants = [initiatorId, counterpartyId];

  const ref = await addDoc(collection(db, COLLECTION.DISPUTES), {
    initiatorId,
    type,
    orderId,
    counterpartyId,
    participants,
    reason,
    description,
    evidence,
    status: 'OPEN',
    assignedTo: null,
    resolution: null,
    messages: [{
      senderId: initiatorId,
      text: description || reason,
      at: new Date().toISOString(),
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { disputeId: ref.id };
}

/**
 * Add message to dispute (participants or admin).
 */
export async function addDisputeMessage(disputeId, senderId, text) {
  if (!text || text.trim().length === 0) throw new Error('Pesan tidak boleh kosong.');
  if (text.length > 1000) throw new Error('Pesan maksimal 1000 karakter.');

  await updateDoc(doc(db, COLLECTION.DISPUTES, disputeId), {
    messages: arrayUnion({
      senderId,
      text: text.trim(),
      at: new Date().toISOString(),
    }),
    updatedAt: serverTimestamp(),
  });
}

/**
 * List disputes (filter by participant or admin all).
 */
export async function listDisputes(opts = {}) {
  const { participantId, status, pageSize = 20, cursor } = opts;
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (status) constraints.unshift(where('status', '==', status));
  if (participantId) constraints.unshift(where('participants', 'array-contains', participantId));

  let q = query(collection(db, COLLECTION.DISPUTES), ...constraints);
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Get dispute by id.
 */
export async function getDispute(disputeId) {
  const snap = await getDoc(doc(db, COLLECTION.DISPUTES, disputeId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Admin assign dispute.
 */
export async function assignDispute(disputeId, adminId) {
  await updateDoc(doc(db, COLLECTION.DISPUTES, disputeId), {
    assignedTo: adminId,
    status: 'IN_REVIEW',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin resolve dispute.
 * @param {string} resolution - 'BUYER_FAVORED' | 'SELLER_FAVORED' | 'COURIER_FAVORED' | 'COMPROMISE' | 'DISMISSED'
 */
export async function resolveDispute(disputeId, adminId, resolution, note = '') {
  const validResolutions = ['BUYER_FAVORED', 'SELLER_FAVORED', 'COURIER_FAVORED', 'COMPROMISE', 'DISMISSED'];
  if (!validResolutions.includes(resolution)) {
    throw new Error('Resolution tidak valid.');
  }

  await updateDoc(doc(db, COLLECTION.DISPUTES, disputeId), {
    status: 'RESOLVED',
    resolution,
    resolutionNote: note,
    resolvedBy: adminId,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, COLLECTION.AUDIT_LOGS), {
    actorId: adminId,
    action: 'DISPUTE_RESOLVED',
    target: disputeId,
    newValue: resolution,
    note,
    timestamp: serverTimestamp(),
  });
}

/**
 * Close dispute (after resolved, no further action).
 */
export async function closeDispute(disputeId, adminId) {
  await updateDoc(doc(db, COLLECTION.DISPUTES, disputeId), {
    status: 'CLOSED',
    closedAt: serverTimestamp(),
    closedBy: adminId,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Stats for admin dashboard.
 */
export async function getDisputeStats() {
  const all = await getDocs(query(collection(db, COLLECTION.DISPUTES), limit(1000)));
  const docs = all.docs.map((d) => d.data());
  return {
    total: docs.length,
    open: docs.filter((d) => d.status === 'OPEN').length,
    inReview: docs.filter((d) => d.status === 'IN_REVIEW').length,
    resolved: docs.filter((d) => d.status === 'RESOLVED').length,
  };
}
