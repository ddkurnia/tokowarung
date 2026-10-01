// ============================================
// TokoWarung — Order Service
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
  // FIRESTORE RULE: ALL reads must execute BEFORE ALL writes in a transaction.
  // So we do 2 separate loops: (1) read & validate all products, (2) write all updates.
  const orderRef = doc(collection(db, COLLECTION.ORDERS)); // auto id
  const result = await runTransaction(db, async (tx) => {
    const itemMeta = [];
    const productRefs = [];

    // 1. PHASE READ: Read & validate ALL products first (NO writes yet)
    for (const it of items) {
      const pRef = doc(db, COLLECTION.PRODUCTS, it.productId);
      const pSnap = await tx.get(pRef);
      if (!pSnap.exists()) throw new Error(`Produk ${it.name} tidak ditemukan.`);
      const p = pSnap.data();
      if (p.status !== PRODUCT_STATUS.APPROVED) throw new Error(`Produk ${it.name} tidak tersedia.`);
      const availStock = (p.stock || 0) - (p.reservedStock || 0);
      if (availStock < it.qty) throw new Error(`Stok ${it.name} tidak cukup (sisa ${availStock}).`);
      // Save for write phase
      productRefs.push({ ref: pRef, qty: it.qty });
      itemMeta.push({ productId: it.productId, name: p.name, price: it.price, qty: it.qty, weight: it.weight || 0 });
    }

    // 2. PHASE WRITE: Now do all writes (after all reads complete)
    for (const { ref, qty } of productRefs) {
      tx.update(ref, {
        reservedStock: increment(qty),
        updatedAt: serverTimestamp(),
      });
    }

    // 3. Create order (write)
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

    // NOTE: Order items sub-collection creation dihapus karena:
    // 1. Items sudah disimpan di order.items array (audit-able via order doc)
    // 2. Firestore rules sebelumnya deny write ke sub-collection (allow write: if false)
    // 3. Menghindari PERMISSION_DENIED error saat createOrder
    // 4. Save 1 Firestore write per item (lebih hemat)
    // Untuk audit per-item di masa depan, gunakan Cloud Functions trigger on order create.

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

// ============================================
// COURIER ASSIGNMENT & VERIFICATION (Phase 2.5)
// ============================================

/**
 * Auto-assign courier saat order status = READY_FOR_PICKUP.
 * Phase 6: pakai smartAssignCourier (ranking by distance + load + rating).
 * Fallback ke simple assign kalau smart dispatch error (e.g., no seller location).
 *
 * @param {string} orderId
 * @param {string} sellerId - untuk audit log
 * @returns {Promise<{courierId: string, pickupCode: string}>}
 */
export async function autoAssignCourier(orderId, sellerId) {
  try {
    const { smartAssignCourier } = await import('./dispatchService.js');
    return await smartAssignCourier(orderId, sellerId);
  } catch (err) {
    console.warn('[orderService] Smart dispatch failed, falling back to simple assign:', err.message);
    return await simpleAssignCourier(orderId, sellerId);
  }
}

/**
 * Simple assign courier (fallback): pick first online courier without ranking.
 */
async function simpleAssignCourier(orderId, sellerId) {
  const orderRef = doc(db, COLLECTION.ORDERS, orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error('Order tidak ditemukan.');
  const order = orderSnap.data();

  if (order.orderStatus !== 'READY_FOR_PICKUP') {
    throw new Error('Order harus berstatus READY_FOR_PICKUP untuk assign courier.');
  }
  if (order.courierId) {
    throw new Error('Courier sudah ditugaskan untuk order ini.');
  }

  // Find online & available couriers (max 1 active order per courier in MVP)
  const q = query(
    collection(db, COLLECTION.COURIERS),
    where('isOnline', '==', true),
    where('status', '==', 'ONLINE_AVAILABLE'),
    limit(5)
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error('Tidak ada kurir online saat ini. Coba lagi nanti atau admin akan assign manual.');
  }

  // Pick first available courier (simplified — proper dispatch engine pakai: distance, load, rating, dll)
  const courierDoc = snap.docs[0];
  const courierId = courierDoc.id;

  // Generate 6-digit pickup code
  const pickupCode = String(Math.floor(100000 + Math.random() * 900000));

  await updateDoc(orderRef, {
    courierId,
    orderStatus: 'COURIER_ASSIGNED',
    pickupCode,
    'timestamps.COURIER_ASSIGNED': serverTimestamp(),
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: 'READY_FOR_PICKUP',
      to: 'COURIER_ASSIGNED',
      actorId: sellerId,
      note: `Simple-assigned courier ${courierId.slice(0, 8)}... (smart dispatch fallback)`,
      at: new Date().toISOString(),
    }),
  });

  await notifyOrderStatusChange({ ...order, id: orderId, orderStatus: "COURIER_ASSIGNED" }, "COURIER_ASSIGNED", sellerId).catch(e => console.warn(e));
  return { courierId, pickupCode };
}

/**
 * Courier accept order (after assignment).
 * Status: COURIER_ASSIGNED → COURIER_GOING_TO_PICKUP
 */
export async function courierAcceptOrder(orderId, courierId) {
  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const order = snap.data();
  if (order.courierId !== courierId) throw new Error('Order ini bukan milikmu.');
  if (order.orderStatus !== 'COURIER_ASSIGNED') throw new Error('Order sudah diproses.');

  await updateDoc(ref, {
    orderStatus: 'COURIER_GOING_TO_PICKUP',
    'timestamps.COURIER_GOING_TO_PICKUP': serverTimestamp(),
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: 'COURIER_ASSIGNED',
      to: 'COURIER_GOING_TO_PICKUP',
      actorId: courierId,
      note: "Courier accepted, going to pickup",
      at: new Date().toISOString(),
    }),
  });
}

/**
 * Courier reject order — release assignment, status balik ke READY_FOR_PICKUP.
 * Admin bisa re-assign manual atau auto-assign ulang.
 */
export async function courierRejectOrder(orderId, courierId, reason = '') {
  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const order = snap.data();
  if (order.courierId !== courierId) throw new Error('Order ini bukan milikmu.');

  await updateDoc(ref, {
    orderStatus: 'READY_FOR_PICKUP',
    courierId: null,
    pickupCode: null,
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: 'COURIER_ASSIGNED',
      to: 'READY_FOR_PICKUP',
      actorId: courierId,
      note: `Courier rejected: ${reason || 'no reason'}`,
      at: new Date().toISOString(),
    }),
  });
}

/**
 * Courier verify pickup code (entered by seller).
 * If valid → status = PICKED_UP, generate delivery OTP.
 *
 * @param {string} orderId
 * @param {string} courierId
 * @param {string} code - 6-digit code dari seller
 */
export async function verifyPickupCode(orderId, courierId, code) {
  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const order = snap.data();
  if (order.courierId !== courierId) throw new Error('Order ini bukan milikmu.');
  if (!['COURIER_GOING_TO_PICKUP', 'ARRIVED_PICKUP'].includes(order.orderStatus)) {
    throw new Error('Pickup verification tidak tersedia pada status ini.');
  }
  if (order.pickupCode !== code) {
    throw new Error('Pickup code salah. Minta code ke seller.');
  }

  // Generate 6-digit delivery OTP untuk buyer confirm saat sampai
  const deliveryOtp = String(Math.floor(100000 + Math.random() * 900000));

  await updateDoc(ref, {
    orderStatus: 'PICKED_UP',
    deliveryOtp,
    pickupCode: null, // clear untuk security
    'timestamps.PICKED_UP': serverTimestamp(),
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: order.orderStatus,
      to: 'PICKED_UP',
      actorId: courierId,
      note: "Pickup verified, delivery OTP generated",
      at: new Date().toISOString(),
    }),
  });

  return { deliveryOtp };
}

/**
 * Courier mark as delivering (after pickup, before delivery).
 */
export async function markDelivering(orderId, courierId) {
  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const order = snap.data();
  if (order.courierId !== courierId) throw new Error('Order ini bukan milikmu.');
  if (order.orderStatus !== 'PICKED_UP') throw new Error('Order harus berstatus PICKED_UP dulu.');

  await updateDoc(ref, {
    orderStatus: 'DELIVERING',
    'timestamps.DELIVERING': serverTimestamp(),
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: 'PICKED_UP',
      to: 'DELIVERING',
      actorId: courierId,
      note: 'Courier started delivery',
      at: new Date().toISOString(),
    }),
  });
}

/**
 * Courier mark as arrived at customer location.
 */
export async function markArrived(orderId, courierId) {
  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const order = snap.data();
  if (order.courierId !== courierId) throw new Error('Order ini bukan milikmu.');
  if (order.orderStatus !== 'DELIVERING') throw new Error('Order harus berstatus DELIVERING dulu.');

  await updateDoc(ref, {
    orderStatus: 'ARRIVED',
    'timestamps.ARRIVED': serverTimestamp(),
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: 'DELIVERING',
      to: 'ARRIVED',
      actorId: courierId,
      note: "Courier arrived at customer",
      at: new Date().toISOString(),
    }),
  });
}

/**
 * Buyer verify delivery OTP (entered by courier).
 * If valid → status = DELIVERED, clear delivery OTP, AUTO-UPDATE WALLETS.
 *
 * @param {string} orderId
 * @param {string} buyerId
 * @param {string} otp - 6-digit OTP dari courier
 */
export async function verifyDeliveryOtp(orderId, buyerId, otp) {
  const ref = doc(db, COLLECTION.ORDERS, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order tidak ditemukan.');
  const order = snap.data();
  if (order.buyerId !== buyerId) throw new Error('Order ini bukan milikmu.');
  if (order.orderStatus !== 'ARRIVED') throw new Error('Order harus berstatus ARRIVED dulu.');
  if (order.deliveryOtp !== otp) throw new Error('OTP salah. Minta OTP ke buyer.');

  await updateDoc(ref, {
    orderStatus: 'DELIVERED',
    deliveryOtp: null, // clear
    'timestamps.DELIVERED': serverTimestamp(),
    'timestamps.updatedAt': serverTimestamp(),
    statusHistory: arrayUnion({
      from: 'ARRIVED',
      to: 'DELIVERED',
      actorId: buyerId,
      note: 'Delivery verified by buyer OTP',
      at: new Date().toISOString(),
    }),
  });

  // Phase 3: AUTO-UPDATE WALLETS (seller pending balance + courier earnings + COD collected)
  // Catatan: ini client-side, kurang aman vs Cloud Function. Tapi untuk MVP tanpa Blaze cukup.
  try {
    const { settleWalletOnDelivery } = await import('./walletService.js');
    const updatedOrder = { ...order, id: orderId, orderStatus: 'DELIVERED' };
    await settleWalletOnDelivery(updatedOrder, 3); // 3% commission default
    // Phase 5: Notify buyer (rating reminder) + seller + courier (commission earned)
    await notifyOrderStatusChange(updatedOrder, 'DELIVERED', buyerId);
  } catch (err) {
    console.error('[orderService] Failed to auto-settle wallet + notify:', err);
    // Don't fail the whole operation if wallet update fails — admin can fix manually
  }

  return { success: true };
}

// ============================================
// NOTIFICATION TRIGGERS (Phase 5)
// ============================================
// Saat order status berubah, kirim notifikasi ke relevant parties.
// Catatan: seharusnya via Cloud Function untuk proper trigger,
// tapi untuk MVP tanpa Blaze, kita trigger dari client.
// ============================================

const STATUS_NOTIF_CONFIG = {
  PAID: {
    title: '💳 Pembayaran Diterima',
    body: (orderId) => `Order #${orderId.slice(-8)} sudah dibayar. Tunggu konfirmasi seller.`,
    recipients: ['sellerId'],
    type: 'PAYMENT',
  },
  SELLER_CONFIRMED: {
    title: '✓ Pesanan Dikonfirmasi',
    body: (orderId) => `Order #${orderId.slice(-8)} dikonfirmasi seller. Sedang disiapkan.`,
    recipients: ['buyerId'],
    type: 'ORDER',
  },
  PREPARING: {
    title: '📦 Sedang Disiapkan',
    body: (orderId) => `Order #${orderId.slice(-8)} sedang disiapkan seller.`,
    recipients: ['buyerId'],
    type: 'ORDER',
  },
  READY_FOR_PICKUP: {
    title: '🛍️ Siap Diambil Kurir',
    body: (orderId) => `Order #${orderId.slice(-8)} siap diambil.`,
    recipients: ['buyerId'],
    type: 'ORDER',
  },
  COURIER_ASSIGNED: {
    title: '🛵 Kurir Ditugaskan',
    body: (orderId) => `Kurir ditugaskan untuk order #${orderId.slice(-8)}.`,
    recipients: ['buyerId', 'courierId'],
    type: 'DELIVERY',
  },
  PICKED_UP: {
    title: '📦 Sudah Diambil Kurir',
    body: (orderId) => `Order #${orderId.slice(-8)} sudah diambil kurir. Sedang dalam perjalanan.`,
    recipients: ['buyerId'],
    type: 'DELIVERY',
  },
  DELIVERING: {
    title: '🛵 Sedang Dikirim',
    body: (orderId) => `Order #${orderId.slice(-8)} sedang dalam perjalanan ke kamu.`,
    recipients: ['buyerId'],
    type: 'DELIVERY',
  },
  ARRIVED: {
    title: '📍 Kurir Sampai',
    body: (orderId) => `Kurir sampai di tujuan untuk order #${orderId.slice(-8)}. Berikan OTP untuk konfirmasi.`,
    recipients: ['buyerId'],
    type: 'DELIVERY',
  },
  DELIVERED: {
    title: '✓ Pesanan Selesai',
    body: (orderId) => `Order #${orderId.slice(-8)} selesai. Beri rating ke seller & kurir.`,
    recipients: ['buyerId', 'sellerId', 'courierId'],
    type: 'ORDER',
  },
  CANCELLED: {
    title: '✕ Pesanan Dibatalkan',
    body: (orderId) => `Order #${orderId.slice(-8)} dibatalkan.`,
    recipients: ['buyerId', 'sellerId', 'courierId'],
    type: 'ORDER',
  },
};

/**
 * Trigger notifications to relevant parties saat order status change.
 * @param {object} order - order data (with buyerId, sellerId, courierId)
 * @param {string} newStatus - new order status
 * @param {string} actorId - uid yang trigger change (skip notif ke dirinya sendiri)
 */
export async function notifyOrderStatusChange(order, newStatus, actorId) {
  const config = STATUS_NOTIF_CONFIG[newStatus];
  if (!config) return;

  const recipients = new Set();
  config.recipients.forEach((key) => {
    const id = order[key];
    if (id && id !== actorId) recipients.add(id);
  });

  if (recipients.size === 0) return;

  const notifPromises = [];
  for (const userId of recipients) {
    notifPromises.push(
      addDoc(collection(db, COLLECTION.NOTIFICATIONS), {
        userId,
        type: config.type,
        title: config.title,
        body: config.body(order.id),
        data: { orderId: order.id, status: newStatus },
        read: false,
        createdAt: serverTimestamp(),
      }).catch((err) => console.warn('[orderService] notif error:', err))
    );
  }
  await Promise.all(notifPromises);
}

// Helper for fetching existing voucher info (used by checkout)
export { getDoc as _getDoc };
