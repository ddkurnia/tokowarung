// ============================================
// TokoWarung — Incident Service (Phase 4)
// ============================================
// Incidents: masalah operasional yang perlu admin handle.
// Contoh: Courier tidak kirim, COD hilang, barang rusak, fraud.
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
} from 'firebase/firestore';
import { COLLECTION } from '../utils/constants.js';

const INCIDENT_TYPES = [
  'COURIER_NO_DELIVERY',      // kurir tidak kirim
  'COURIER_MISSING',          // kurir hilang kontak
  'COD_NOT_SETTLED',          // COD tidak disetor
  'PRODUCT_DAMAGED',          // barang rusak
  'PRODUCT_PROHIBITED',       // produk terlarang
  'SELLER_FRAUD',             // seller fraud
  'BUYER_FRAUD',              // buyer fraud
  'COURIER_FRAUD',            // courier fraud
  'PAYMENT_ISSUE',            // masalah pembayaran
  'OTHER',
];

const INCIDENT_STATUS = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];

/**
 * Create incident (any signed-in user can report).
 */
export async function createIncident({ reporterId, type, orderId = null, sellerId = null, courierId = null, buyerId = null, description = '', evidence = [] }) {
  if (!reporterId) throw new Error('Reporter ID wajib diisi.');
  if (!INCIDENT_TYPES.includes(type)) throw new Error(`Type tidak valid. Pilih: ${INCIDENT_TYPES.join(', ')}`);
  if (!description || description.length < 10) throw new Error('Deskripsi minimal 10 karakter.');

  const ref = await addDoc(collection(db, COLLECTION.INCIDENTS), {
    reporterId,
    type,
    orderId,
    sellerId,
    courierId,
    buyerId,
    description,
    evidence,
    status: 'OPEN',
    assignedTo: null,
    resolution: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { incidentId: ref.id };
}

/**
 * List incidents.
 */
export async function listIncidents(opts = {}) {
  const { status, type, pageSize = 20, cursor } = opts;
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (status) constraints.unshift(where('status', '==', status));
  if (type) constraints.unshift(where('type', '==', type));

  let q = query(collection(db, COLLECTION.INCIDENTS), ...constraints);
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Get incident by id.
 */
export async function getIncident(incidentId) {
  const snap = await getDoc(doc(db, COLLECTION.INCIDENTS, incidentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Admin assign incident.
 */
export async function assignIncident(incidentId, adminId) {
  await updateDoc(doc(db, COLLECTION.INCIDENTS, incidentId), {
    assignedTo: adminId,
    status: 'INVESTIGATING',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin resolve incident.
 * @param {string} resolution - 'CONFIRMED' | 'FALSE_ALARM' | 'ESCALATED'
 */
export async function resolveIncident(incidentId, adminId, resolution, note = '') {
  if (!['CONFIRMED', 'FALSE_ALARM', 'ESCALATED'].includes(resolution)) {
    throw new Error('Resolution tidak valid.');
  }

  await updateDoc(doc(db, COLLECTION.INCIDENTS, incidentId), {
    status: 'RESOLVED',
    resolution,
    resolutionNote: note,
    resolvedBy: adminId,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, COLLECTION.AUDIT_LOGS), {
    actorId: adminId,
    action: 'INCIDENT_RESOLVED',
    target: incidentId,
    newValue: resolution,
    note,
    timestamp: serverTimestamp(),
  });
}

/**
 * Stats.
 */
export async function getIncidentStats() {
  const all = await getDocs(query(collection(db, COLLECTION.INCIDENTS), limit(1000)));
  const docs = all.docs.map((d) => d.data());
  return {
    total: docs.length,
    open: docs.filter((d) => d.status === 'OPEN').length,
    investigating: docs.filter((d) => d.status === 'INVESTIGATING').length,
    fraudReported: docs.filter((d) => d.type.includes('FRAUD')).length,
  };
}
