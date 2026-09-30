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
import { collection, doc, addDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { COLLECTION, PAYMENT_STATUS } from '../utils/constants.js';

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
