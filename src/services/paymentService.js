// ============================================
// TokoWarung — Payment Service Abstraction Layer
// ============================================
// PENTING:
// - Ini adalah abstraction layer. Provider konkret (Midtrans, Xendit, DANA, dll.)
//   di-inject via setProvider() pada bootstrap.
// - Provider hanya boleh set SECRET KEY di server-side (Cloud Functions).
// - Client hanya menyimpan PUBLIC KEY (sudah aman di-expose).
// - Setiap transaksi finansial harus divalidasi server-side via Webhook.
// ============================================

import { db } from '../firebase/config.js';
import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { COLLECTION, PAYMENT_STATUS } from '../utils/constants.js';
import { uploadImageWithRetry } from './storageService.js';

// ----- Default provider (None — harus diset via setProvider) -----
let activeProvider = null;

const fallbackProvider = {
  name: 'MockProvider',
  async createPayment() {
    throw new Error('Payment provider belum dikonfigurasi. Hubungi admin.');
  },
  async getPaymentStatus() {
    return { status: 'UNKNOWN' };
  },
  async refundPayment() {
    throw new Error('Refund belum dikonfigurasi.');
  },
  async calculateFee(amount) {
    return Math.round(amount * 0.007); // 0.7% default est.
  },
  async settlePayment() {
    throw new Error('Settlement belum dikonfigurasi.');
  },
};

/**
 * Set active payment provider (utk dependency injection).
 */
export function setProvider(provider) {
  if (!provider?.name) throw new Error('Provider harus punya name.');
  activeProvider = provider;
}

/**
 * Get provider (utk internal use).
 */
export function getProvider() {
  return activeProvider || fallbackProvider;
}

// ----- Public API (interface tetap sama walau provider berganti) -----

/**
 * Create payment session.
 * @param {object} param
 * @param {string} param.orderId
 * @param {number} param.amount
 * @param {string} param.method — COD | QRIS | VA | EWALLET | GATEWAY
 * @param {object} param.buyer — { id, name, email, phone }
 * @param {object} param.seller — { id, name }
 */
export async function createPayment({ orderId, amount, method, buyer, seller }) {
  if (!orderId) throw new Error('Order ID wajib diisi.');
  if (!amount || amount < 0) throw new Error('Amount tidak valid.');

  const provider = getProvider();
  let providerResponse = null;
  let providerTxId = null;

  try {
    const result = await provider.createPayment({ orderId, amount, method, buyer, seller });
    providerResponse = result;
    providerTxId = result?.transactionId || result?.referenceId || null;
  } catch (err) {
    console.error('[payment] createPayment error:', err);
    throw new Error('Terjadi masalah saat memproses pembayaran. Coba lagi.');
  }

  // Save transaction record (utk audit & reconciliation)
  const txRef = await addDoc(collection(db, COLLECTION.PAYMENTS), {
    orderId,
    providerName: provider.name,
    providerTxId,
    method,
    amount,
    buyerId: buyer?.id || null,
    sellerId: seller?.id || null,
    status: method === 'COD' ? 'PENDING' : 'PENDING',
    providerResponse,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { transactionId: txRef.id, providerTxId, providerResponse, status: 'PENDING' };
}

/**
 * Get payment status by transaction id.
 */
export async function getPaymentStatus(transactionId) {
  if (!transactionId) return { status: 'UNKNOWN' };
  const txSnap = await getDoc(doc(db, COLLECTION.PAYMENTS, transactionId));
  if (!txSnap.exists()) return { status: 'UNKNOWN' };
  return { ...txSnap.data(), id: txSnap.id };
}

/**
 * Refund payment.
 */
export async function refundPayment(transactionId, reason) {
  const provider = getProvider();
  const txSnap = await getDoc(doc(db, COLLECTION.PAYMENTS, transactionId));
  if (!txSnap.exists()) throw new Error('Transaksi tidak ditemukan.');
  const tx = txSnap.data();

  if (tx.method === 'COD') {
    // COD refund handled via ledger adjustment
    await updateDoc(txSnap.ref, { status: PAYMENT_STATUS.REFUNDED, refundReason: reason, refundedAt: serverTimestamp() });
    return { status: 'REFUNDED' };
  }

  const result = await provider.refundPayment(tx.providerTxId, tx.amount, reason);
  await updateDoc(txSnap.ref, { status: PAYMENT_STATUS.REFUNDED, refundReason: reason, refundedAt: serverTimestamp(), providerRefund: result });
  return result;
}

/**
 * Calculate payment fee (utk ditampilkan saat checkout).
 */
export async function calculatePaymentFee(amount, method) {
  const provider = getProvider();
  if (method === 'COD') return 0; // COD tidak ada fee gateway
  return provider.calculateFee(amount, method);
}

/**
 * TODO (production): SettlementService, RefundService, CommissionService
 * Idealnya semua via Cloud Functions untuk integritas finansial.
 * Lihat /functions/index.js untuk implementasi server-side.
 */

// ============================================
// MANUAL PAYMENT PROOF (Phase 3 — tanpa payment gateway)
// ============================================
// Untuk non-COD payments (QRIS, VA, E-Wallet):
// 1. Buyer transfer manual ke bank account platform
// 2. Buyer upload bukti transfer (foto/screenshot) ke Cloudinary
// 3. Buyer submit manual payment proof ke Firestore
// 4. Admin verify di admin panel → mark order as PAID
//
// Ini workaround tanpa payment gateway. Phase 4 (kalau Blaze):
// - Pakai Midtrans/Xendit (auto webhook → auto mark PAID)
// ============================================


/**
 * Buyer submit manual payment proof.
 * @param {object} param
 * @param {string} param.orderId
 * @param {string} param.buyerId
 * @param {string} param.paymentMethod - QRIS, VA, EWALLET
 * @param {File} param.proofFile - bukti transfer image
 * @param {string} param.senderBank - (opsional) bank pengirim
 * @param {string} param.senderAccountName - (opsional) nama pengirim
 * @param {string} param.note - (opsional) catatan
 */
export async function submitManualPaymentProof({ orderId, buyerId, paymentMethod, proofFile, senderBank = '', senderAccountName = '', note = '' }) {
  if (!orderId || !buyerId) throw new Error('Order ID dan buyer ID wajib diisi.');
  if (!proofFile) throw new Error('Bukti pembayaran wajib diupload.');
  if (paymentMethod === 'COD') throw new Error('COD tidak butuh bukti transfer.');

  // 1. Upload proof image ke Cloudinary (folder: paymentProofs)
  const uploadResult = await uploadImageWithRetry(proofFile, { folder: 'tokowarung/paymentProofs' });

  // 2. Create payment record in Firestore
  const txRef = await addDoc(collection(db, COLLECTION.PAYMENTS), {
    orderId,
    buyerId,
    method: paymentMethod,
    amount: 0, // diisi saat admin verify (ambil dari order.total)
    status: 'PENDING_VERIFICATION',
    proofImage: {
      publicId: uploadResult.publicId,
      url: uploadResult.secureUrl,
    },
    senderBank,
    senderAccountName,
    note,
    submittedAt: serverTimestamp(),
    verifiedAt: null,
    verifiedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { transactionId: txRef.id, proofUrl: uploadResult.secureUrl };
}

/**
 * Get payment records untuk order (buyer view).
 */
export async function getPaymentProofs(orderId) {
  if (!orderId) return [];
  const q = query(
    collection(db, COLLECTION.PAYMENTS),
    where('orderId', '==', orderId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Admin: list pending payment verifications.
 */
export async function listPendingPaymentVerifications(opts = {}) {
  const { pageSize = 20 } = opts;
  const q = query(
    collection(db, COLLECTION.PAYMENTS),
    where('status', '==', 'PENDING_VERIFICATION'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

/**
 * Admin: verify manual payment proof.
 * - Get order, fetch total amount
 * - Mark payment status = VERIFIED
 * - Update order status = PAID (via orderService.updateOrderStatus — admin has permission)
 *
 * @param {string} paymentId
 * @param {string} adminId
 * @param {boolean} approve - true = verified (mark PAID), false = rejected
 * @param {string} note - (opsional) alasan kalau reject
 */
export async function adminVerifyPaymentProof(paymentId, adminId, approve, note = '') {
  if (!paymentId || !adminId) throw new Error('Parameter tidak valid.');

  const paymentRef = doc(db, COLLECTION.PAYMENTS, paymentId);
  const snap = await getDoc(paymentRef);
  if (!snap.exists()) throw new Error('Payment record tidak ditemukan.');
  const payment = snap.data();
  if (payment.status !== 'PENDING_VERIFICATION') throw new Error('Payment sudah diverify.');

  if (approve) {
    // Mark as verified
    await updateDoc(paymentRef, {
      status: 'VERIFIED',
      verifiedAt: serverTimestamp(),
      verifiedBy: adminId,
      note,
      updatedAt: serverTimestamp(),
    });

    // Get order total
    const orderSnap = await getDoc(doc(db, COLLECTION.ORDERS, payment.orderId));
    if (!orderSnap.exists()) throw new Error('Order tidak ditemukan.');
    const order = orderSnap.data();
    await updateDoc(paymentRef, { amount: order.total });

    // Update order status to PAID
    await updateDoc(doc(db, COLLECTION.ORDERS, payment.orderId), {
      orderStatus: 'PAID',
      paymentStatus: 'PAID',
      'timestamps.PAID': serverTimestamp(),
      'timestamps.updatedAt': serverTimestamp(),
      statusHistory: arrayUnion({
        from: 'PENDING_PAYMENT',
        to: 'PAID',
        actorId: adminId,
        role: 'ADMIN',
        note: `Payment verified. Note: ${note}`,
        at: new Date().toISOString(),
      }),
    });

    return { verified: true, orderId: payment.orderId };
  } else {
    // Mark as rejected
    await updateDoc(paymentRef, {
      status: 'REJECTED',
      verifiedAt: serverTimestamp(),
      verifiedBy: adminId,
      note,
      updatedAt: serverTimestamp(),
    });

    return { verified: false };
  }
}
