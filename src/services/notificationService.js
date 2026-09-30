// ============================================
// TokOnline — Notification Service
// In-app notifications. Push notification via FCM (TODO).
// ============================================

import { db } from '../firebase/config.js';
import { collection, doc, addDoc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { COLLECTION, NOTIF_TYPE } from '../utils/constants.js';

/**
 * Create notification untuk user.
 * Catatan: ini dipanggil oleh Cloud Function saat order/payment/delivery status berubah,
 * TAPI bisa juga dipanggil client-side utk notification non-kritis (promo, dsb).
 */
export async function createNotification({ userId, type = NOTIF_TYPE.SYSTEM, title, body, data = {} }) {
  if (!userId) throw new Error('User ID wajib diisi.');
  if (!title) throw new Error('Title wajib diisi.');
  await addDoc(collection(db, COLLECTION.NOTIFICATIONS), {
    userId,
    type,
    title,
    body,
    data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Subscribe ke notifications realtime.
 * @param {string} userId
 * @param {(items: array) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeToNotifications(userId, cb) {
  if (!userId) return () => {};
  const q = query(
    collection(db, COLLECTION.NOTIFICATIONS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Mark notification as read.
 */
export async function markRead(notifId) {
  await updateDoc(doc(db, COLLECTION.NOTIFICATIONS, notifId), { read: true, readAt: serverTimestamp() });
}

/**
 * Mark all unread as read.
 */
export async function markAllRead(userId) {
  const q = query(
    collection(db, COLLECTION.NOTIFICATIONS),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true, readAt: serverTimestamp() })));
}
