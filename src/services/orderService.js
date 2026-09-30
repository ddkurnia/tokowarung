// ============================================
// TokOnline — Order Service
// Pembuatan & lifecycle order.
// Catatan: semua update status penting sebaiknya via Cloud Function
// untuk integritas finansial. Service ini handle client-side state.
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
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  runTransaction,
  increment,
  arrayUnion,
} from 'firebase/firestore';

import { COLLECTION, ORDER_STATUS, PRODUCT_STATUS } from '../utils/constants.js';
import { formatRupiah } from '../utils/helpers.js';

// ----- CREATE ORDER (multi-seller checkout) -----
// Catatan: untuk MVP, 1 checkout = 1 order per seller (lebih mudah dikelola).
// Cart dengan multiple seller akan dipecah jadi multiple orders.

/**
 * Create order dari cart (per seller).
 * @param {object} param
 * @param {string} param.buyerId
 * @param {string} param.sellerId
 * @param {Array} param.items — [{ productId, name, price, qty, weight, image }]
 * @param {object} param.shippingAddress — { name, phone, fullAddress, lat, lng, note }
 * @param {number} param.shippingFee
 * @param {number} param.serviceFee
 * @param {number} param.discount
 * @param {string} param.paymentMethod — COD | QRIS | VA | EWALLET | GATEWAY
 * @returns {Promise<{orderId: string, total: number}>}
 */
export async function createOrder({
  buyerId,
  sellerId,
  items,
  shippingAddress,
  shippingFee = 0,
  serviceFee = 0,
  discount = 0,
  paymentMethod,
}) {
  if (!buyerId) throw new Error('Buyer wajib diisi.');
  if (!sellerId) throw new Error('Seller wajib diisi.');
  if (!items?.length) throw new Error('Item order tidak boleh kosong.');
  if (!paymentMethod) throw new Error('Metode pembayaran wajib diisi.');

  // Calculate totals
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const total = subtotal - discount + shippingFee + serviceFee;

  // Atomic transaction: create order + reserve stock + create order items
  const orderRef = doc(collection(db, COLLECTION.ORDERS)); // auto id
  const result = await runTransaction(db, async (tx) => {
    // 1. Verify & reserve stock for each item
    const itemMeta = [];
    for (const it of items) {
      const pRef = doc(db, COLLECTION.PRODUCTS, it.productId);
      const pSnap = await tx.get(pRef);
      if (!pSnap.exists()) throw new Error(`Produk ${it.name} tidak ditemukan.`);
      const p = pSnap.data();
      if (p.status !== PRODUCT_STATUS.APPROVED) throw new Error(`Produk ${it.name} tidak tersedia.`);
      const availStock = (p.stock || 0) - (p.reservedStock || 0);
      if (availStock < it.qty) throw new Error(`Stok ${it.name} tidak cukup (sisa ${availStock}).`);

      // Reserve stock
      tx.update(pRef, {
        reservedStock: increment(it.qty),
        updatedAt: serverTimestamp(),
      });
      itemMeta.push({ productId: it.productId, name: p.name, price: it.price, qty: it.qty });
    }

    // 2. Create order
    const orderPayload = {
      buyerId,
      sellerId,
      items: itemMeta,
      subtotal,
      discount,
      shippingFee,
      serviceFee,
      platformFee: 0, // dihitung oleh Cloud Function saat settle
      total,
      paymentMethod,
      paymentStatus: 'PENDING',
      orderStatus: ORDER_STATUS.PENDING_PAYMENT,
      deliveryStatus: 'PENDING',
      shippingAddress,
      courierId: null,
      timestamps: {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    };
    tx.set(orderRef, orderPayload);

    // 3. Create order items sub-collection (utk audit & detail per item)
    for (const it of itemMeta) {
      const itemRef = doc(collection(db, COLLECTION.ORDERS, orderRef.id, COLLECTION.ORDER_ITEMS));
      tx.set(itemRef, {
        ...it,
        sellerId,
        buyerId,
        orderId: orderRef.id,
        createdAt: serverTimestamp(),
      });
    }

    return { orderId: orderRef.id, total };
  });

  return result;
}

/**
 * Get order by id.
 */
export async function getOrderById(orderId) {
  const snap = await getDoc(doc(db, COLLECTION.ORDERS, orderId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * List orders by buyer.
 */
export async function listBuyerOrders(buyerId, opts = {}) {
  const { pageSize = 20, status, cursor } = opts;
  const constraints = [where('buyerId', '==', buyerId), orderBy('timestamps.createdAt', 'desc'), limit(pageSize)];
  if (status) constraints.splice(1, 0, where('orderStatus', '==', status));
  let q = query(collection(db, COLLECTION.ORDERS), ...constraints);
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * List orders for seller.
 */
export async function listSellerOrders(sellerId, opts = {}) {
  const { pageSize = 20, status, cursor } = opts;
  const constraints = [where('sellerId', '==', sellerId), orderBy('timestamps.createdAt', 'desc'), limit(pageSize)];
  if (status) constraints.splice(1, 0, where('orderStatus', '==', status));
  let q = query(collection(db, COLLECTION.ORDERS), ...constraints);
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Update order status (transition yang sah).
 * Catatan: idealnya via Cloud Function untuk audit & validation.
 */
export async function updateOrderStatus(orderId, newStatus, actorId, note = '') {
  const validTransitions = {
    PENDING_PAYMENT: ['PAID', 'CANCELLED'],
    PAID: ['SELLER_CONFIRMED', 'CANCELLED'],
    SELLER_CONFIRMED: ['PREPARING'],
    PREPARING: ['READY_FOR_PICKUP'],
    READY_FOR_PICKUP: ['COURIER_ASSIGNED', 'CANCELLED'],
    COURIER_ASSIGNED: ['COURIER_GOING_TO_PICKUP', 'CANCELLED'],
    COURIER_GOING_TO_PICKUP: ['ARRIVED_PICKUP', 'CANCELLED'],
    PICKED_UP: ['DELIVERING', 'CANCELLED'],
    DELIVERING: ['ARRIVED', 'CANCELLED'],
    ARRIVED: ['DELIVERED', 'DISPUTED'],
    DELIVERED: ['REFUND_REQUESTED', 'DISPUTED'],
    REFUND_REQUESTED: ['REFUNDED', 'DISPUTED'],
    DISPUTED: ['REFUNDED', 'DELIVERED'],
  };

  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const current = snap.data().orderStatus;

  const allowed = validTransitions[current] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Transisi status tidak sah: ${current} → ${newStatus}`);
  }

  await updateDoc(ref, {
    orderStatus: newStatus,
    'timestamps.updatedAt': serverTimestamp(),
    [`timestamps.${newStatus}`]: serverTimestamp(),
    statusHistory: arrayUnion({ from: current, to: newStatus, actorId, note, at: new Date().toISOString() }),
  });
}

/**
 * Cancel order — release reserved stock.
 */
export async function cancelOrder(orderId, actorId) {
  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const order = snap.data();

  if (!['PENDING_PAYMENT', 'PAID', 'READY_FOR_PICKUP', 'COURIER_ASSIGNED'].includes(order.orderStatus)) {
    throw new Error('Order tidak dapat dibatalkan pada status ini.');
  }

  // Release reserved stock
  for (const it of order.items) {
    const pRef = doc(db, COLLECTION.PRODUCTS, it.productId);
    await updateDoc(pRef, { reservedStock: increment(-it.qty), updatedAt: serverTimestamp() });
  }

  await updateOrderStatus(orderId, 'CANCELLED', actorId, 'Order cancelled');
}
