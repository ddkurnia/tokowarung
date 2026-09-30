// ============================================
// TokOnline — Product Service
// CRUD produk + query marketplace. Mematuhi security rules.
// Seller bisa CRUD produk miliknya. Buyer hanya read APPROVED.
// ============================================

import { db } from '../firebase/config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
} from 'firebase/firestore';

import { COLLECTION, PRODUCT_STATUS, UI } from '../utils/constants.js';

// ----- PUBLIC (Buyer) -----

/**
 * List produk APPROVED, urut berdasarkan createdAt desc.
 * @param {object} opts
 * @param {number} opts.pageSize
 * @param {string} opts.categoryId
 * @param {string} opts.sellerId
 * @param {number} opts.maxPrice
 * @param {string} opts.searchText
 * @param {DocumentSnapshot} opts.cursor — untuk pagination
 */
export async function listApprovedProducts(opts = {}) {
  const { pageSize = UI.PAGE_SIZE, categoryId, sellerId, maxPrice, searchText, cursor } = opts;
  const constraints = [
    where('status', '==', PRODUCT_STATUS.APPROVED),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc'),
  ];
  if (categoryId) constraints.push(where('category', '==', categoryId));
  if (sellerId) constraints.push(where('sellerId', '==', sellerId));
  if (maxPrice) constraints.push(where('price', '<=', maxPrice));

  let q = query(collection(db, COLLECTION.PRODUCTS), ...constraints, limit(pageSize));
  if (cursor) q = query(q, startAfter(cursor));

  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { items, cursor: snap.docs[snap.docs.length - 1] || null, hasMore: snap.size === pageSize };
}

/**
 * Get detail produk by id (harus APPROVED untuk buyer, atau milik sendiri untuk seller).
 */
export async function getProductById(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTION.PRODUCTS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Search produk approved — simple like search di client side.
 * TODO: utk production-scale, gunakan Algolia / ElasticSearch / Cloud Function full-text search.
 */
export async function searchProducts(text, opts = {}) {
  if (!text || text.trim().length < 2) return { items: [], cursor: null, hasMore: false };
  // Firestore tidak mendukung search LIKE. Untuk MVP, fetch by category filter + client filter.
  // TODO: implementasi Algolia atau Firestore search extensions (Cloud Function + Algolia triggers).
  const { pageSize = UI.PAGE_SIZE } = opts;
  const q = query(
    collection(db, COLLECTION.PRODUCTS),
    where('status', '==', PRODUCT_STATUS.APPROVED),
    where('isActive', '==', true),
    limit(pageSize * 3) // over-fetch untuk client filter
  );
  const snap = await getDocs(q);
  const term = text.toLowerCase();
  const items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.description || '').toLowerCase().includes(term) ||
      (p.tags || []).some((t) => (t || '').toLowerCase().includes(term))
    )
    .slice(0, pageSize);
  return { items, cursor: null, hasMore: false };
}

// ----- SELLER -----

/**
 * List produk milik seller (semua status).
 */
export async function listSellerProducts(sellerId, opts = {}) {
  if (!sellerId) return { items: [], cursor: null, hasMore: false };
  const { pageSize = UI.PAGE_SIZE, status, cursor } = opts;
  const constraints = [
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];
  if (status) constraints.splice(1, 0, where('status', '==', status));
  let q = query(collection(db, COLLECTION.PRODUCTS), ...constraints);
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Buat produk baru (status DRAFT — seller tidak boleh APPROVE sendiri).
 */
export async function createProduct(sellerId, data) {
  if (!sellerId) throw new Error('Seller wajib diisi.');
  const payload = {
    ...data,
    sellerId,
    status: PRODUCT_STATUS.DRAFT,
    isActive: false,
    soldCount: 0,
    rating: 0,
    totalRatings: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION.PRODUCTS), payload);
  return { id: ref.id, ...payload };
}

/**
 * Update produk milik seller (status tidak boleh diubah ke APPROVED langsung).
 */
export async function updateProduct(productId, sellerId, patch) {
  // PENTING: seller tidak boleh approve sendiri. Field 'status' tidak boleh di-set ke APPROVED dari sini.
  if (patch.status === PRODUCT_STATUS.APPROVED) {
    delete patch.status;
  }
  // Saat produk diedit, kembalikan ke PENDING_REVIEW (kecuali seller menyimpan sebagai DRAFT)
  if (!patch.status && patch.status !== PRODUCT_STATUS.DRAFT) {
    patch.status = PRODUCT_STATUS.PENDING_REVIEW;
  }
  patch.updatedAt = serverTimestamp();
  await updateDoc(doc(db, COLLECTION.PRODUCTS, productId), patch);
  return { id: productId, ...patch };
}

/**
 * Submit produk DRAFT ke review.
 */
export async function submitProductForReview(productId) {
  await updateDoc(doc(db, COLLECTION.PRODUCTS, productId), {
    status: PRODUCT_STATUS.PENDING_REVIEW,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Hapus produk milik seller.
 */
export async function deleteProduct(productId, sellerId) {
  // Soft delete via status, hard delete hanya untuk DRAFT.
  await deleteDoc(doc(db, COLLECTION.PRODUCTS, productId));
}

// ----- ADMIN moderation -----

/**
 * List produk pending review (untuk admin moderation queue).
 */
export async function listPendingReviewProducts(opts = {}) {
  const { pageSize = UI.PAGE_SIZE, cursor } = opts;
  let q = query(
    collection(db, COLLECTION.PRODUCTS),
    where('status', '==', PRODUCT_STATUS.PENDING_REVIEW),
    orderBy('submittedAt', 'desc'),
    limit(pageSize)
  );
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Approve produk (admin only — security rules akan enforce).
 */
export async function approveProduct(productId, adminId) {
  await updateDoc(doc(db, COLLECTION.PRODUCTS, productId), {
    status: PRODUCT_STATUS.APPROVED,
    isActive: true,
    approvedAt: serverTimestamp(),
    approvedBy: adminId,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reject produk dengan alasan (admin only).
 */
export async function rejectProduct(productId, adminId, reason) {
  await updateDoc(doc(db, COLLECTION.PRODUCTS, productId), {
    status: PRODUCT_STATUS.REJECTED,
    isActive: false,
    rejectedAt: serverTimestamp(),
    rejectedBy: adminId,
    rejectionReason: reason,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Suspend produk (admin only).
 */
export async function suspendProduct(productId, adminId, reason) {
  await updateDoc(doc(db, COLLECTION.PRODUCTS, productId), {
    status: PRODUCT_STATUS.SUSPENDED,
    isActive: false,
    suspendedAt: serverTimestamp(),
    suspendedBy: adminId,
    suspensionReason: reason,
    updatedAt: serverTimestamp(),
  });
}
