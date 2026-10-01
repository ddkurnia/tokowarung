// ============================================
// TokoWarung — Promotion Service (Phase 5)
// ============================================
// Voucher system: code-based discounts (percent or flat).
// Free shipping voucher.
// Platform promotions (admin creates) vs seller promotions (seller creates).
// Anti-abuse: track usage count, limit per user.
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

const VOUCHER_TYPES = ['PERCENT', 'FLAT', 'FREE_SHIPPING'];
const VOUCHER_OWNER = ['PLATFORM', 'SELLER'];

/**
 * Create voucher (admin or seller).
 *
 * @param {object} param
 * @param {string} param.code - voucher code (uppercase)
 * @param {string} param.ownerType - PLATFORM | SELLER
 * @param {string} param.ownerId - adminId atau sellerId
 * @param {string} param.discountType - PERCENT | FLAT | FREE_SHIPPING
 * @param {number} param.discountValue - persen (1-100) atau amount (rupiah)
 * @param {number} param.maxDiscount - maksimal discount (untuk PERCENT, dalam rupiah)
 * @param {number} param.minPurchase - minimum purchase amount (rupiah)
 * @param {Date|string} param.startDate
 * @param {Date|string} param.endDate
 * @param {number} param.maxUsage - total usage limit (null = unlimited)
 * @param {number} param.maxUsagePerUser - limit per user (default 1)
 * @param {string} param.sellerIdScope - null = all sellers, atau specific sellerId
 * @param {string} param.categoryScope - null = all categories
 * @param {string} param.description
 */
export async function createVoucher({ code, ownerType, ownerId, discountType, discountValue, maxDiscount = null, minPurchase = 0, startDate, endDate, maxUsage = null, maxUsagePerUser = 1, sellerIdScope = null, categoryScope = null, description = '' }) {
  if (!code) throw new Error('Code wajib diisi.');
  if (!VOUCHER_OWNER.includes(ownerType)) throw new Error('Owner type tidak valid.');
  if (!VOUCHER_TYPES.includes(discountType)) throw new Error('Discount type tidak valid.');
  if (discountType === 'PERCENT' && (discountValue < 1 || discountValue > 100)) throw new Error('Persentase harus 1-100.');
  if (discountType === 'FLAT' && discountValue <= 0) throw new Error('Amount harus > 0.');
  if (!startDate || !endDate) throw new Error('Start & end date wajib diisi.');

  const codeUpper = code.toUpperCase().trim();
  if (!/^[A-Z0-9]{4,20}$/.test(codeUpper)) {
    throw new Error('Code harus 4-20 karakter, huruf besar + angka saja.');
  }

  // Check if code already exists
  const existingSnap = await getDocs(query(
    collection(db, COLLECTION.COUPONS),
    where('code', '==', codeUpper),
    limit(1)
  ));
  if (!existingSnap.empty) throw new Error(`Code "${codeUpper}" sudah dipakai voucher lain.`);

  const ref = await addDoc(collection(db, COLLECTION.COUPONS), {
    code: codeUpper,
    ownerType,
    ownerId,
    discountType,
    discountValue,
    maxDiscount,
    minPurchase,
    startDate,
    endDate,
    maxUsage,
    maxUsagePerUser,
    sellerIdScope,
    categoryScope,
    description,
    isActive: true,
    usedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { voucherId: ref.id, code: codeUpper };
}

/**
 * Validate voucher untuk checkout.
 * Returns discount info kalau valid, throws Error kalau invalid.
 *
 * @param {string} code - voucher code
 * @param {string} userId - buyer uid
 * @param {number} subtotal
 * @param {number} shippingFee
 * @param {string} sellerId - current seller in checkout (for scope check)
 */
export async function validateVoucher(code, userId, subtotal, shippingFee, sellerId) {
  if (!code || !userId) throw new Error('Code dan user ID wajib diisi.');

  const codeUpper = code.toUpperCase().trim();
  const snap = await getDocs(query(
    collection(db, COLLECTION.COUPONS),
    where('code', '==', codeUpper),
    where('isActive', '==', true),
    limit(1)
  ));
  if (snap.empty) throw new Error('Voucher tidak ditemukan atau sudah nonaktif.');

  const voucher = { id: snap.docs[0].id, ...snap.docs[0].data() };

  // Date check
  const now = new Date();
  const start = voucher.startDate?.toDate ? voucher.startDate.toDate() : new Date(voucher.startDate);
  const end = voucher.endDate?.toDate ? voucher.endDate.toDate() : new Date(voucher.endDate);
  if (now < start) throw new Error('Voucher belum berlaku.');
  if (now > end) throw new Error('Voucher sudah berakhir.');

  // Usage limit check
  if (voucher.maxUsage && (voucher.usedCount || 0) >= voucher.maxUsage) {
    throw new Error('Voucher sudah mencapai batas pemakaian.');
  }

  // Per-user limit check (query usage history)
  const usageSnap = await getDocs(query(
    collection(db, COLLECTION.COUPONS),
    where('voucherId', '==', voucher.id),
    where('userId', '==', userId),
    limit(voucher.maxUsagePerUser || 1)
  ));
  if (usageSnap.size >= (voucher.maxUsagePerUser || 1)) {
    throw new Error(`Kamu sudah pakai voucher ini (max ${voucher.maxUsagePerUser}x per user).`);
  }

  // Min purchase check
  if (voucher.minPurchase && subtotal < voucher.minPurchase) {
    throw new Error(`Minimum pembelian Rp ${(voucher.minPurchase).toLocaleString('id-ID')}.`);
  }

  // Scope check (seller-specific)
  if (voucher.sellerIdScope && voucher.sellerIdScope !== sellerId) {
    throw new Error('Voucher ini tidak berlaku untuk toko ini.');
  }

  // Calculate discount
  let discountAmount = 0;
  let freeShipping = false;

  if (voucher.discountType === 'PERCENT') {
    discountAmount = Math.round((subtotal * voucher.discountValue) / 100);
    if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
      discountAmount = voucher.maxDiscount;
    }
  } else if (voucher.discountType === 'FLAT') {
    discountAmount = voucher.discountValue;
    if (discountAmount > subtotal) discountAmount = subtotal; // Tidak boleh lebih dari subtotal
  } else if (voucher.discountType === 'FREE_SHIPPING') {
    discountAmount = 0;
    freeShipping = true;
  }

  return {
    voucherId: voucher.id,
    code: voucher.code,
    discountType: voucher.discountType,
    discountAmount,
    freeShipping,
    description: voucher.description,
  };
}

/**
 * Record voucher usage (after order paid).
 * Catatan: harus dipanggil setelah order PAID untuk anti-abuse.
 */
export async function recordVoucherUsage(voucherId, userId, orderId, discountAmount) {
  // Increment voucher.usedCount
  await updateDoc(doc(db, COLLECTION.COUPONS, voucherId), {
    usedCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  // Create usage record (for anti-abuse tracking)
  // Catatan: untuk MVP, simpan di sub-collection voucherUsage.
  // Kalau rules tidak allow, simpan di transactions collection dengan type=VOUCHER_USAGE.
  await addDoc(collection(db, COLLECTION.TRANSACTIONS), {
    type: 'VOUCHER_USAGE',
    voucherId,
    userId,
    orderId,
    discountAmount,
    timestamp: serverTimestamp(),
  });
}

/**
 * List active vouchers (for buyer to see what's available).
 */
export async function listActiveVouchers(opts = {}) {
  const { sellerId, pageSize = 20 } = opts;
  const now = new Date();
  const q = query(
    collection(db, COLLECTION.COUPONS),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Filter by date in client (Firestore can't do date range + where clauses easily)
  return {
    items: items.filter((v) => {
      const start = v.startDate?.toDate ? v.startDate.toDate() : new Date(v.startDate);
      const end = v.endDate?.toDate ? v.endDate.toDate() : new Date(v.endDate);
      const inDate = now >= start && now <= end;
      const inScope = !v.sellerIdScope || v.sellerIdScope === sellerId;
      const inUsage = !v.maxUsage || (v.usedCount || 0) < v.maxUsage;
      return inDate && inScope && inUsage;
    }),
  };
}

/**
 * List vouchers created by seller (for their management page).
 */
export async function listSellerVouchers(sellerId, opts = {}) {
  if (!sellerId) return { items: [] };
  const { pageSize = 30 } = opts;
  const q = query(
    collection(db, COLLECTION.COUPONS),
    where('ownerId', '==', sellerId),
    where('ownerType', '==', 'SELLER'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Deactivate voucher (owner or admin).
 */
export async function deactivateVoucher(voucherId, actorId) {
  await updateDoc(doc(db, COLLECTION.COUPONS, voucherId), {
    isActive: false,
    updatedAt: serverTimestamp(),
    deactivatedBy: actorId,
  });
}
