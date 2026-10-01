// ============================================
// TokoWarung — Report Service (Phase 4)
// ============================================
// Buyer dapat melaporkan: produk, seller, courier, order, review, chat.
// Admin lihat queue dengan priority LOW/MEDIUM/HIGH/URGENT.
// ============================================

import { db, isFirebaseConfigured } from '../firebase/config.js';
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
import { COLLECTION, REPORT_PRIORITY } from '../utils/constants.js';

const REPORT_TYPES = ['PRODUCT', 'SELLER', 'COURIER', 'ORDER', 'REVIEW', 'CHAT'];

/**
 * Create new report.
 * @param {object} param
 * @param {string} param.reporterId - uid user yang report
 * @param {string} param.type - REPORT_TYPES
 * @param {string} param.targetId - id of product/seller/courier/order/review/chat
 * @param {string} param.reason - short reason (e.g., "Produk terlarang", "Penipuan")
 * @param {string} param.description - detailed description
 * @param {string} param.priority - LOW | MEDIUM | HIGH | URGENT
 * @param {Array<{url, publicId}>} param.evidence - photo/screenshot URLs
 */
export async function createReport({ reporterId, type, targetId, reason, description = '', priority = REPORT_PRIORITY.MEDIUM, evidence = [] }) {
  if (!reporterId) throw new Error('Reporter ID wajib diisi.');
  if (!REPORT_TYPES.includes(type)) throw new Error(`Type tidak valid. Pilih: ${REPORT_TYPES.join(', ')}`);
  if (!targetId) throw new Error('Target ID wajib diisi.');
  if (!reason) throw new Error('Reason wajib diisi.');

  // Auto-set priority berdasarkan reason keywords
  const finalPriority = autoSetPriority(reason + ' ' + description, priority);

  const ref = await addDoc(collection(db, COLLECTION.REPORTS), {
    reporterId,
    type,
    targetId,
    reason,
    description,
    priority: finalPriority,
    evidence,
    status: 'PENDING',
    assignedTo: null, // adminId yang handle
    resolution: null, // verdict + action
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { reportId: ref.id };
}

/**
 * Auto-set priority based on keywords (anti-spam / critical flagging).
 */
function autoSetPriority(text, currentPriority) {
  const criticalKeywords = ['narkoba', 'senjata', 'peledak', 'anak', 'pornografi', 'penipuan', 'fraud'];
  const textLower = text.toLowerCase();
  for (const kw of criticalKeywords) {
    if (textLower.includes(kw)) return REPORT_PRIORITY.URGENT;
  }
  return currentPriority;
}

/**
 * List reports (admin: all, user: own reports).
 */
export async function listReports(opts = {}) {
  const { reporterId, status, priority, pageSize = 20, cursor } = opts;
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (reporterId) constraints.unshift(where('reporterId', '==', reporterId));
  if (status) constraints.unshift(where('status', '==', status));
  if (priority) constraints.unshift(where('priority', '==', priority));

  let q = query(collection(db, COLLECTION.REPORTS), ...constraints);
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Admin assign report ke dirinya sendiri.
 */
export async function assignReport(reportId, adminId) {
  await updateDoc(doc(db, COLLECTION.REPORTS, reportId), {
    assignedTo: adminId,
    status: 'IN_REVIEW',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin resolve report (with verdict).
 * @param {string} reportId
 * @param {string} adminId
 * @param {string} resolution - "VERIFIED" | "DISMISSED" | "ESCALATED"
 * @param {string} note - admin note
 */
export async function resolveReport(reportId, adminId, resolution, note = '') {
  if (!['VERIFIED', 'DISMISSED', 'ESCALATED'].includes(resolution)) {
    throw new Error('Resolution tidak valid.');
  }
  await updateDoc(doc(db, COLLECTION.REPORTS, reportId), {
    status: resolution,
    resolution: note,
    resolvedBy: adminId,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Audit log entry
  await addDoc(collection(db, COLLECTION.AUDIT_LOGS), {
    actorId: adminId,
    action: 'REPORT_RESOLVED',
    target: reportId,
    oldValue: 'PENDING/IN_REVIEW',
    newValue: resolution,
    note,
    timestamp: serverTimestamp(),
  });
}

/**
 * Get report by id.
 */
export async function getReport(reportId) {
  const snap = await getDoc(doc(db, COLLECTION.REPORTS, reportId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Stats for admin dashboard.
 */
export async function getReportStats() {
  const all = await getDocs(query(collection(db, COLLECTION.REPORTS), limit(1000)));
  const docs = all.docs.map((d) => d.data());
  return {
    total: docs.length,
    pending: docs.filter((d) => d.status === 'PENDING').length,
    inReview: docs.filter((d) => d.status === 'IN_REVIEW').length,
    urgent: docs.filter((d) => d.priority === 'URGENT' && d.status !== 'VERIFIED' && d.status !== 'DISMISSED').length,
  };
}
