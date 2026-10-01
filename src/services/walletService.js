// ============================================
// TokoWarung — Wallet Service (Phase 3, tanpa Cloud Functions)
// ============================================
// Handle wallet operations untuk seller & courier.
// Semua wallet mutations client-side (no Cloud Function).
//
// SECURITY CAVEAT (without Cloud Functions):
// - Wallet updates client-side = less secure (buyer/seller bisa manipulasi)
// - Mitigation: Firestore rules strict (hanya owner & admin)
// - TODO Phase 4 (kalau Blaze): pindahkan ke Cloud Functions untuk audit trail
//
// Wallet document structure (sellerWallets/{uid}, courierWallets/{uid}):
// {
//   uid, role,
//   pendingBalance: number,   // dari order DELIVERED, menunggu settlement
//   availableBalance: number, // sudah settled, bisa di-withdraw
//   withdrawnTotal: number,   // total sudah di-withdraw
//   commissionTotal: number,  // total commission dipotong platform
//   refundTotal: number,
//   adjustmentTotal: number,
//   lastUpdated: timestamp,
//   history: [{ type, amount, note, at, orderId? }]
// }
// ============================================

import { db, isFirebaseConfigured } from '../firebase/config.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  increment,
  arrayUnion,
} from 'firebase/firestore';
import { COLLECTION } from '../utils/constants.js';

// ============================================
// GET WALLET
// ============================================

/**
 * Get seller wallet (auto-create if not exist).
 */
export async function getSellerWallet(uid) {
  if (!uid) return null;
  const ref = doc(db, COLLECTION.SELLER_WALLETS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // Auto-create with zero balances
    const newWallet = {
      uid,
      role: 'SELLER',
      pendingBalance: 0,
      availableBalance: 0,
      withdrawnTotal: 0,
      commissionTotal: 0,
      refundTotal: 0,
      adjustmentTotal: 0,
      lastUpdated: serverTimestamp(),
      history: [],
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, newWallet);
    return { id: uid, ...newWallet };
  }
  return { id: snap.id, ...snap.data() };
}

/**
 * Get courier wallet (auto-create if not exist).
 */
export async function getCourierWallet(uid) {
  if (!uid) return null;
  const ref = doc(db, COLLECTION.COURIER_WALLETS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const newWallet = {
      uid,
      role: 'COURIER',
      earnings: 0,             // from delivered orders (courier fee)
      codCollected: 0,         // cash yang courier pegang dari COD order
      codSettled: 0,           // cash yang sudah disetor ke admin/platform
      codOutstanding: 0,       // codCollected - codSettled
      bonusTotal: 0,
      withdrawnTotal: 0,
      adjustmentTotal: 0,
      lastUpdated: serverTimestamp(),
      history: [],
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, newWallet);
    return { id: uid, ...newWallet };
  }
  return { id: snap.id, ...snap.data() };
}

// ============================================
// AUTO-UPDATE WALLET SAAT ORDER DELIVERED
// ============================================

/**
 * Auto-update wallet saat order status = DELIVERED.
 * - Seller: pendingBalance += order.subtotal (minus platform commission)
 * - Courier: earnings += order.shippingFee (atau courierFee), jika COD: codCollected += order.total
 *
 * Catatan: Tanpa Cloud Function, ini dipanggil dari client setelah verifyDeliveryOtp.
 *
 * @param {object} order - order data
 * @param {number} platformCommissionPercent - default 3 (dari settings)
 */
export async function settleWalletOnDelivery(order, platformCommissionPercent = 3) {
  if (!order) throw new Error('Order wajib diisi.');
  if (order.orderStatus !== 'DELIVERED') {
    throw new Error('Order harus berstatus DELIVERED untuk settle wallet.');
  }

  const isCOD = order.paymentMethod === 'COD';
  const commissionAmount = Math.round((order.subtotal * platformCommissionPercent) / 100);
  const sellerNet = order.subtotal - commissionAmount;

  // 1. Update seller wallet
  const sellerWalletRef = doc(db, COLLECTION.SELLER_WALLETS, order.sellerId);
  await updateDoc(sellerWalletRef, {
    pendingBalance: increment(sellerNet),
    commissionTotal: increment(commissionAmount),
    lastUpdated: serverTimestamp(),
    history: arrayUnion({
      type: 'ORDER_DELIVERED',
      amount: sellerNet,
      commission: commissionAmount,
      orderId: order.id,
      note: `Order #${order.id.slice(-8)} delivered`,
      at: new Date().toISOString(),
    }),
  });

  // 2. Update courier wallet (shipping fee as earnings)
  if (order.courierId) {
    const courierWalletRef = doc(db, COLLECTION.COURIER_WALLETS, order.courierId);
    const courierPatch = {
      earnings: increment(order.shippingFee || 0),
      lastUpdated: serverTimestamp(),
      history: arrayUnion({
        type: 'DELIVERY_EARNING',
        amount: order.shippingFee || 0,
        orderId: order.id,
        note: `Delivery fee from order #${order.id.slice(-8)}`,
        at: new Date().toISOString(),
      }),
    };

    // Untuk COD: courier pegang cash dari buyer, masuk ke codCollected
    if (isCOD) {
      courierPatch.codCollected = increment(order.total);
      courierPatch.codOutstanding = increment(order.total);
      courierPatch.history = arrayUnion({
        type: 'COD_COLLECTED',
        amount: order.total,
        orderId: order.id,
        note: `COD collected from buyer for order #${order.id.slice(-8)}`,
        at: new Date().toISOString(),
      });
    }

    await updateDoc(courierWalletRef, courierPatch);
  }

  // 3. Record in transactions collection (audit trail)
  await addDoc(collection(db, COLLECTION.TRANSACTIONS), {
    type: 'ORDER_SETTLEMENT',
    orderId: order.id,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    courierId: order.courierId || null,
    subtotal: order.subtotal,
    commission: commissionAmount,
    sellerNet,
    courierFee: order.shippingFee || 0,
    codCollected: isCOD ? order.total : 0,
    paymentMethod: order.paymentMethod,
    timestamp: serverTimestamp(),
  });

  return { sellerNet, commissionAmount };
}

// ============================================
// WITHDRAWAL REQUEST
// ============================================

/**
 * Seller/Courier request withdrawal.
 * @param {string} uid
 * @param {string} role - 'SELLER' | 'COURIER'
 * @param {number} amount
 * @param {object} bankInfo - { bank, accountNumber, holderName }
 */
export async function requestWithdrawal(uid, role, amount, bankInfo) {
  if (!uid || !role) throw new Error('UID dan role wajib diisi.');
  if (!amount || amount <= 0) throw new Error('Amount harus > 0.');
  if (amount < 50000) throw new Error('Minimum withdrawal Rp 50.000.');

  // Verify sufficient balance
  const wallet = role === 'SELLER' ? await getSellerWallet(uid) : await getCourierWallet(uid);
  if (!wallet) throw new Error('Wallet tidak ditemukan.');
  const availableBalance = role === 'SELLER' ? wallet.pendingBalance : wallet.earnings;
  // Catatan: untuk MVP, availableBalance = pendingBalance (belum ada settlement period)
  // Phase 4: bedakan pending (waiting settlement) vs available (settled)
  if (amount > availableBalance) {
    throw new Error(`Saldo tidak cukup. Saldo tersedia: Rp ${availableBalance.toLocaleString('id-ID')}.`);
  }

  // Create withdrawal request
  const ref = await addDoc(collection(db, COLLECTION.WITHDRAWALS), {
    userId: uid,
    role,
    amount,
    bankInfo,
    status: 'REQUESTED',
    requestedAt: serverTimestamp(),
    processedAt: null,
    processedBy: null,
    note: '',
  });

  // Lock the amount (kurangi available balance, pindah ke "in withdrawal")
  // Catatan: untuk MVP, kita KURANGI balance langsung. Kalau withdrawal rejected, admin restore.
  const walletRef = doc(db, role === 'SELLER' ? COLLECTION.SELLER_WALLETS : COLLECTION.COURIER_WALLETS, uid);
  if (role === 'SELLER') {
    await updateDoc(walletRef, {
      pendingBalance: increment(-amount),
      withdrawnTotal: increment(amount),
      lastUpdated: serverTimestamp(),
      history: arrayUnion({
        type: 'WITHDRAWAL_REQUESTED',
        amount: -amount,
        withdrawalId: ref.id,
        note: `Withdrawal request to ${bankInfo.bank} ${bankInfo.accountNumber}`,
        at: new Date().toISOString(),
      }),
    });
  } else {
    await updateDoc(walletRef, {
      earnings: increment(-amount),
      withdrawnTotal: increment(amount),
      lastUpdated: serverTimestamp(),
      history: arrayUnion({
        type: 'WITHDRAWAL_REQUESTED',
        amount: -amount,
        withdrawalId: ref.id,
        note: `Withdrawal request to ${bankInfo.bank} ${bankInfo.accountNumber}`,
        at: new Date().toISOString(),
      }),
    });
  }

  return { withdrawalId: ref.id };
}

/**
 * List withdrawal requests (untuk admin atau user sendiri).
 */
export async function listWithdrawals(userId, opts = {}) {
  if (!userId) return { items: [] };
  const { pageSize = 20, status } = opts;
  const constraints = [where('userId', '==', userId), orderBy('requestedAt', 'desc'), limit(pageSize)];
  if (status) constraints.splice(1, 0, where('status', '==', status));
  const q = query(collection(db, COLLECTION.WITHDRAWALS), ...constraints);
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.size === pageSize,
  };
}

// ============================================
// ADMIN WALLET OPERATIONS
// ============================================

/**
 * Admin: approve withdrawal (mark as COMPLETED).
 * Bank transfer dilakukan manual oleh admin di luar sistem.
 */
export async function approveWithdrawal(withdrawalId, adminId, note = '') {
  if (!withdrawalId || !adminId) throw new Error('Parameter tidak valid.');
  const ref = doc(db, COLLECTION.WITHDRAWALS, withdrawalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Withdrawal tidak ditemukan.');
  const w = snap.data();
  if (w.status !== 'REQUESTED') throw new Error('Withdrawal sudah diproses.');

  await updateDoc(ref, {
    status: 'COMPLETED',
    processedAt: serverTimestamp(),
    processedBy: adminId,
    note,
  });

  // Record in transactions
  await addDoc(collection(db, COLLECTION.TRANSACTIONS), {
    type: 'WITHDRAWAL_APPROVED',
    actorId: adminId,
    userId: w.userId,
    role: w.role,
    amount: w.amount,
    withdrawalId,
    timestamp: serverTimestamp(),
  });

  return { success: true };
}

/**
 * Admin: reject withdrawal (restore balance to user).
 */
export async function rejectWithdrawal(withdrawalId, adminId, reason = '') {
  if (!withdrawalId || !adminId) throw new Error('Parameter tidak valid.');
  const ref = doc(db, COLLECTION.WITHDRAWALS, withdrawalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Withdrawal tidak ditemukan.');
  const w = snap.data();
  if (w.status !== 'REQUESTED') throw new Error('Withdrawal sudah diproses.');

  // Restore balance
  const walletRef = doc(db, w.role === 'SELLER' ? COLLECTION.SELLER_WALLETS : COLLECTION.COURIER_WALLETS, w.userId);
  if (w.role === 'SELLER') {
    await updateDoc(walletRef, {
      pendingBalance: increment(w.amount),
      withdrawnTotal: increment(-w.amount),
      lastUpdated: serverTimestamp(),
      history: arrayUnion({
        type: 'WITHDRAWAL_REJECTED',
        amount: w.amount,
        withdrawalId,
        note: `Withdrawal rejected: ${reason}`,
        at: new Date().toISOString(),
      }),
    });
  } else {
    await updateDoc(walletRef, {
      earnings: increment(w.amount),
      withdrawnTotal: increment(-w.amount),
      lastUpdated: serverTimestamp(),
      history: arrayUnion({
        type: 'WITHDRAWAL_REJECTED',
        amount: w.amount,
        withdrawalId,
        note: `Withdrawal rejected: ${reason}`,
        at: new Date().toISOString(),
      }),
    });
  }

  await updateDoc(ref, {
    status: 'REJECTED',
    processedAt: serverTimestamp(),
    processedBy: adminId,
    note: reason,
  });

  return { success: true };
}

/**
 * Admin: settle seller wallet (move pending → available).
 * Dipanggil manual setelah periode settlement (misal: 3 hari setelah delivered).
 */
export async function adminSettleSellerWallet(sellerId, adminId, amount = null) {
  const wallet = await getSellerWallet(sellerId);
  const settleAmount = amount || wallet.pendingBalance;
  if (settleAmount <= 0) throw new Error('Tidak ada pending balance untuk di-settle.');

  const ref = doc(db, COLLECTION.SELLER_WALLETS, sellerId);
  await updateDoc(ref, {
    pendingBalance: increment(-settleAmount),
    availableBalance: increment(settleAmount),
    lastUpdated: serverTimestamp(),
    history: arrayUnion({
      type: 'SETTLEMENT',
      amount: settleAmount,
      note: `Settled by admin ${adminId.slice(0, 8)}`,
      at: new Date().toISOString(),
    }),
  });

  await addDoc(collection(db, COLLECTION.TRANSACTIONS), {
    type: 'SETTLEMENT',
    actorId: adminId,
    userId: sellerId,
    role: 'SELLER',
    amount: settleAmount,
    timestamp: serverTimestamp(),
  });

  return { settled: settleAmount };
}

/**
 * Admin: verify COD settlement (courier setor cash ke admin).
 * Move codCollected → codSettled, increase seller availableBalance.
 */
export async function adminVerifyCODSettlement(courierId, adminId, amount) {
  const wallet = await getCourierWallet(courierId);
  if (wallet.codOutstanding < amount) {
    throw new Error(`COD outstanding tidak cukup. Saat ini: Rp ${wallet.codOutstanding.toLocaleString('id-ID')}.`);
  }

  const ref = doc(db, COLLECTION.COURIER_WALLETS, courierId);
  await updateDoc(ref, {
    codSettled: increment(amount),
    codOutstanding: increment(-amount),
    lastUpdated: serverTimestamp(),
    history: arrayUnion({
      type: 'COD_SETTLED',
      amount,
      note: `COD settled to platform by admin ${adminId.slice(0, 8)}`,
      at: new Date().toISOString(),
    }),
  });

  await addDoc(collection(db, COLLECTION.TRANSACTIONS), {
    type: 'COD_SETTLEMENT',
    actorId: adminId,
    userId: courierId,
    role: 'COURIER',
    amount,
    timestamp: serverTimestamp(),
  });

  return { settled: amount };
}

/**
 * Admin: list all pending withdrawals (untuk approval queue).
 */
export async function listPendingWithdrawals(opts = {}) {
  const { pageSize = 20 } = opts;
  const q = query(
    collection(db, COLLECTION.WITHDRAWALS),
    where('status', '==', 'REQUESTED'),
    orderBy('requestedAt', 'desc'),
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
 * Admin: list all wallets (overview).
 */
export async function listAllWallets(role = 'SELLER', opts = {}) {
  const { pageSize = 50 } = opts;
  const col = role === 'SELLER' ? COLLECTION.SELLER_WALLETS : COLLECTION.COURIER_WALLETS;
  const q = query(collection(db, col), limit(pageSize));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
