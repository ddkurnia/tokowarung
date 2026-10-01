// ============================================
// TokoWarung — POS Service (Phase 6 — foundation only)
// ============================================
// Foundation untuk seller offline sales + inventory sync.
// Catatan: untuk MVP, hanya record offline sales.
// Inventory sync otomatis ke products collection.
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

/**
 * Record offline sale (POS transaction).
 * Auto-update product stock (decrement).
 *
 * @param {object} param
 * @param {string} param.sellerId
 * @param {Array<{productId, name, price, qty}>} param.items
 * @param {string} param.paymentMethod - 'CASH' | 'QRIS' | 'DEBIT'
 * @param {number} param.totalAmount
 * @param {string} param.customerName - optional walk-in customer
 */
export async function recordOfflineSale({ sellerId, items, paymentMethod = 'CASH', totalAmount, customerName = 'Walk-in Customer' }) {
  if (!sellerId) throw new Error('Seller ID wajib.');
  if (!items?.length) throw new Error('Items tidak boleh kosong.');
  if (!totalAmount || totalAmount < 0) throw new Error('Total amount tidak valid.');

  // Calculate total from items (verify)
  const calculatedTotal = items.reduce((s, it) => s + (it.price * it.qty), 0);
  if (Math.abs(calculatedTotal - totalAmount) > 100) {
    throw new Error('Total tidak sesuai dengan subtotal items.');
  }

  // 1. Create offline sale record
  const ref = await addDoc(collection(db, 'offlineSales'), {
    sellerId,
    items: items.map((it) => ({
      productId: it.productId,
      name: it.name,
      price: it.price,
      qty: it.qty,
      subtotal: it.price * it.qty,
    })),
    paymentMethod,
    totalAmount,
    customerName,
    saleType: 'OFFLINE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Update product stock (decrement soldCount + stock)
  for (const it of items) {
    if (!it.productId) continue;
    const pRef = doc(db, COLLECTION.PRODUCTS, it.productId);
    try {
      await updateDoc(pRef, {
        stock: increment(-it.qty),
        soldCount: increment(it.qty),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn(`[pos] Failed to update stock for ${it.productId}:`, err.message);
    }
  }

  // 3. Record transaction (audit)
  await addDoc(collection(db, COLLECTION.TRANSACTIONS), {
    type: 'OFFLINE_SALE',
    actorId: sellerId,
    amount: totalAmount,
    offlineSaleId: ref.id,
    paymentMethod,
    timestamp: serverTimestamp(),
  });

  return { saleId: ref.id };
}

/**
 * List offline sales for seller (history).
 */
export async function listOfflineSales(sellerId, opts = {}) {
  if (!sellerId) return { items: [] };
  const { pageSize = 30 } = opts;
  const q = query(
    collection(db, 'offlineSales'),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Get today's offline sales summary (for POS dashboard).
 */
export async function getTodayOfflineSales(sellerId) {
  if (!sellerId) return null;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const snap = await getDocs(query(
    collection(db, 'offlineSales'),
    where('sellerId', '==', sellerId),
    limit(1000)
  ));
  const todaySales = snap.docs
    .map((d) => d.data())
    .filter((s) => {
      const createdAt = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
      return createdAt >= todayStart;
    });

  return {
    count: todaySales.length,
    totalRevenue: todaySales.reduce((s, sale) => s + (sale.totalAmount || 0), 0),
    itemsSold: todaySales.reduce((s, sale) => s + sale.items.reduce((ss, it) => ss + it.qty, 0), 0),
  };
}
