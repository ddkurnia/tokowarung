// ============================================
// TokOnline — Cloud Functions (Server-side)
// ============================================
// PENTING:
// - File ini berisi function yang TIDAK BOLEH dijalankan dari client:
//   1. Update order status (untuk integritas)
//   2. Update wallet balances (untuk integritas finansial)
//   3. Auto-dispatch courier
//   4. Payment gateway webhooks
//   5. Audit log creation
//
// - Semua secret (Payment server keys, service account) hanya ada di sini
//   via functions.config() atau environment variables.
// - Client-side HANYA memicu function ini (callable), BUKAN execute logic.
//
// TODO (urutkan prioritas untuk Phase selanjutnya):
//   1. onOrderStatusChange → trigger audit log + notification
//   2. onPaymentPaid → release reserved stock, settle seller wallet
//   3. autoDispatchCourier → saat order READY_FOR_PICKUP
//   4. processWithdrawal → review & transfer via disbursement service
//   5. calculateLedger → cron job harian untuk reconciliation
// ============================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

// Init Admin SDK (auto-configured saat deploy ke Firebase)
admin.initializeApp();
const db = admin.firestore();

// ============================================
// Callable: Update Order Status
// Dipanggil oleh client (seller, courier, admin) untuk update status order.
// Melakukan validasi server-side dan log audit.
// ============================================
exports.updateOrderStatus = onCall(async (req) => {
  // 1. Auth check
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.');
  }
  const uid = req.auth.uid;
  const { orderId, newStatus, note } = req.data;
  if (!orderId || !newStatus) {
    throw new HttpsError('invalid-argument', 'orderId dan newStatus wajib diisi.');
  }

  // 2. Fetch user profile untuk role check
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', 'Profil user tidak ditemukan.');
  }
  const user = userSnap.data();

  // 3. Fetch order
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError('not-found', 'Order tidak ditemukan.');
  }
  const order = orderSnap.data();

  // 4. Role check: seller bisa update status order miliknya, courier untuk delivery status, admin bisa semua
  const isOwnerSeller = order.sellerId === uid;
  const isOwnerCourier = order.courierId === uid;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  // Validasi transisi status yang sah
  const validTransitions = {
    PENDING_PAYMENT: ['PAID', 'CANCELLED'],
    PAID: ['SELLER_CONFIRMED', 'CANCELLED'],
    SELLER_CONFIRMED: ['PREPARING'],
    PREPARING: ['READY_FOR_PICKUP'],
    READY_FOR_PICKUP: ['COURIER_ASSIGNED', 'CANCELLED'],
    COURIER_ASSIGNED: ['COURIER_GOING_TO_PICKUP', 'CANCELLED'],
    COURIER_GOING_TO_PICKUP: ['ARRIVED_PICKUP', 'PICKED_UP', 'CANCELLED'],
    ARRIVED_PICKUP: ['PICKED_UP'],
    PICKED_UP: ['DELIVERING'],
    DELIVERING: ['ARRIVED'],
    ARRIVED: ['DELIVERED', 'DISPUTED'],
    DELIVERED: ['REFUND_REQUESTED'],
    REFUND_REQUESTED: ['REFUNDED', 'DISPUTED'],
    DISPUTED: ['REFUNDED', 'DELIVERED'],
  };

  const currentStatus = order.orderStatus;
  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new HttpsError('failed-precondition', `Transisi tidak sah: ${currentStatus} → ${newStatus}`);
  }

  // 5. Update dengan timestamp & history
  const now = admin.firestore.Timestamp.now();
  await orderRef.update({
    orderStatus: newStatus,
    'timestamps.updatedAt': now,
    [`timestamps.${newStatus}`]: now,
    statusHistory: admin.firestore.FieldValue.arrayUnion({
      from: currentStatus,
      to: newStatus,
      actorId: uid,
      role: user.role,
      note: note || '',
      at: now.toDate().toISOString(),
    }),
  });

  // 6. Log audit
  await db.collection('auditLogs').add({
    actorId: uid,
    role: user.role,
    action: 'ORDER_STATUS_CHANGE',
    target: orderId,
    oldValue: currentStatus,
    newValue: newStatus,
    note: note || '',
    timestamp: now,
  });

  // 7. Send notification to relevant parties
  const recipients = new Set([order.buyerId, order.sellerId]);
  if (order.courierId) recipients.add(order.courierId);
  recipients.delete(uid);

  const notifPromises = [];
  for (const userId of recipients) {
    notifPromises.push(
      db.collection('notifications').add({
        userId,
        type: 'ORDER',
        title: `Status pesanan diperbarui: ${newStatus}`,
        body: `Order #${orderId.slice(-6)} sekarang ${newStatus.replace(/_/g, ' ').toLowerCase()}`,
        data: { orderId, status: newStatus },
        read: false,
        createdAt: now,
      })
    );
  }
  await Promise.all(notifPromises);

  return { success: true, orderId, status: newStatus };
});

// ============================================
// Callable: Set Courier Online/Offline
// ============================================
exports.setCourierOnline = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login diperlukan.');
  const { isOnline, location } = req.data;
  if (typeof isOnline !== 'boolean') throw new HttpsError('invalid-argument', 'isOnline harus boolean.');

  const uid = req.auth.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  if (!user || user.role !== 'COURIER') {
    throw new HttpsError('permission-denied', 'Hanya kurir yang bisa set online.');
  }

  await db.collection('couriers').doc(uid).update({
    isOnline,
    status: isOnline ? 'ONLINE_AVAILABLE' : 'OFFLINE',
    currentLocation: location || null,
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, isOnline };
});

// ============================================
// Trigger: Audit log untuk perubahan kritis settings
// ============================================
exports.logSettingsChange = onDocumentUpdated('settings/{docId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const changedFields = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));

  await db.collection('auditLogs').add({
    actorId: 'system',
    role: 'SUPER_ADMIN',
    action: 'SETTINGS_CHANGE',
    target: event.params.docId,
    oldValue: changedFields.reduce((acc, k) => { acc[k] = before[k]; return acc; }, {}),
    newValue: changedFields.reduce((acc, k) => { acc[k] = after[k]; return acc; }, {}),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
});

// ============================================
// TODO (production): autoDispatchCourier
// Trigger ketika order status = READY_FOR_PICKUP
// ============================================
// exports.autoDispatchCourier = onDocumentUpdated('orders/{orderId}', async (event) => {
//   const before = event.data.before.data();
//   const after = event.data.after.data();
//
//   if (before.orderStatus === 'READY_FOR_PICKUP' && after.orderStatus === 'COURIER_ASSIGNED') return;
//   if (after.orderStatus !== 'READY_FOR_PICKUP') return;
//
//   // 1. Find online & available couriers in seller's zone
//   // 2. Rank by: distance to seller, current load, rating
//   // 3. Send offer to top courier
//   // 4. Set order.dispatchOfferExpiresAt = now + 30s
//   // 5. If timeout, offer to next courier
//   // 6. If no courier, escalate to admin queue
// });

// ============================================
// TODO (production): Payment Webhook handler
// Dipanggil oleh payment gateway setelah pembayaran sukses/gagal.
// ============================================
// exports.paymentWebhook = onRequest({ cors: false }, async (req, res) => {
//   const signature = req.headers['x-callback-signature'];
//   // verify signature with server key
//   const { order_id, transaction_status } = req.body;
//
//   const tx = await db.collection('payments').where('orderId', '==', order_id).get();
//   if (tx.empty) return res.status(404).send('Not found');
//
//   // Update transaction status
//   // If PAID: trigger order status update to PAID
//   // If FAILED: trigger order cancel
// });

// ============================================
// TODO (production): Settle Seller Wallet
// Cron job harian untuk release pending balance → available balance
// ============================================
// exports.settleSellerWallets = onSchedule('0 2 * * *', async () => {
//   // 1. Query transactions with status=PENDING and createdAt < 3 days ago
//   // 2. Move amount from pending to available in sellerWallets
//   // 3. Update transaction status to SETTLED
// });
