// ============================================
// TokOnline — Seller Dashboard Service
// Wrapper untuk fetch data seller dashboard (stats, recent orders, etc).
// ============================================

import { db } from '../firebase/config.js';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { COLLECTION } from '../utils/constants.js';

export async function getSellerProfile(uid) {
  const snap = await getDoc(doc(db, COLLECTION.SELLERS, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listSellerProducts(sellerId, opts = {}) {
  const { pageSize = 20, status, cursor } = opts;
  const constraints = [where('sellerId', '==', sellerId), orderBy('createdAt', 'desc'), limit(pageSize)];
  if (status) constraints.splice(1, 0, where('status', '==', status));
  const q = query(collection(db, COLLECTION.PRODUCTS), ...constraints);
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}
