// ============================================
// TokoWarung — Chat Service (Phase 5)
// ============================================
// Realtime chat: Buyer ↔ Seller, Buyer ↔ Courier.
// Conversations collection = top-level chat metadata.
// Messages sub-collection = actual messages.
// ============================================

import { db, isFirebaseConfigured } from '../firebase/config.js';
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
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { COLLECTION, NOTIF_TYPE } from '../utils/constants.js';

/**
 * Create or get existing conversation between two users about an order.
 * @param {object} param
 * @param {string} param.buyerId
 * @param {string} param.sellerId - null for buyer↔courier chat
 * @param {string} param.courierId - null for buyer↔seller chat
 * @param {string} param.orderId - context for chat
 * @param {string} param.type - 'BUYER_SELLER' | 'BUYER_COURIER'
 */
export async function getOrCreateConversation({ buyerId, sellerId = null, courierId = null, orderId, type }) {
  if (!buyerId) throw new Error('Buyer ID wajib diisi.');
  if (!orderId) throw new Error('Order ID wajib diisi.');
  if (type !== 'BUYER_SELLER' && type !== 'BUYER_COURIER') throw new Error('Type tidak valid.');
  if (type === 'BUYER_SELLER' && !sellerId) throw new Error('Seller ID wajib untuk BUYER_SELLER chat.');
  if (type === 'BUYER_COURIER' && !courierId) throw new Error('Courier ID wajib untuk BUYER_COURIER chat.');

  // Check if conversation already exists
  const constraints = [
    where('buyerId', '==', buyerId),
    where('orderId', '==', orderId),
    where('type', '==', type),
    limit(1),
  ];
  if (type === 'BUYER_SELLER') constraints.push(where('sellerId', '==', sellerId));
  if (type === 'BUYER_COURIER') constraints.push(where('courierId', '==', courierId));

  const existingSnap = await getDocs(query(collection(db, COLLECTION.MESSAGES), ...constraints));
  if (!existingSnap.empty) {
    return { conversationId: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
  }

  // Create new conversation
  const ref = await addDoc(collection(db, COLLECTION.MESSAGES), {
    buyerId,
    sellerId,
    courierId,
    orderId,
    type,
    participants: type === 'BUYER_SELLER' ? [buyerId, sellerId] : [buyerId, courierId],
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    unreadCount: { [buyerId]: 0, [sellerId || courierId]: 0 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { conversationId: ref.id, buyerId, sellerId, courierId, orderId, type };
}

/**
 * Send message in a conversation.
 */
export async function sendMessage(conversationId, senderId, text) {
  if (!conversationId || !senderId) throw new Error('Parameter tidak valid.');
  if (!text || text.trim().length === 0) throw new Error('Pesan tidak boleh kosong.');
  if (text.length > 1000) throw new Error('Pesan maksimal 1000 karakter.');

  const convRef = doc(db, COLLECTION.MESSAGES, conversationId);
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) throw new Error('Conversation tidak ditemukan.');
  const conv = convSnap.data();

  // Verify sender is participant
  if (!conv.participants?.includes(senderId)) {
    throw new Error('Anda bukan participant di conversation ini.');
  }

  // Add message to sub-collection
  const msgRef = await addDoc(collection(convRef, 'messages'), {
    senderId,
    text: text.trim(),
    type: 'TEXT',
    createdAt: serverTimestamp(),
  });

  // Update conversation metadata
  const recipientId = conv.participants.find((p) => p !== senderId);
  const patch = {
    lastMessage: text.trim().slice(0, 100), // truncate for preview
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
  };
  // Increment recipient's unread count
  if (recipientId) {
    patch[`unreadCount.${recipientId}`] = increment(1);
  }
  await updateDoc(convRef, patch);

  // Create notification for recipient
  try {
    const notifRef = await addDoc(collection(db, COLLECTION.NOTIFICATIONS), {
      userId: recipientId,
      type: NOTIF_TYPE.CHAT,
      title: 'Pesan baru',
      body: text.trim().slice(0, 100),
      data: { conversationId, senderId },
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[chat] Failed to create notification:', err);
  }

  return { messageId: msgRef.id };
}

/**
 * List conversations for a user.
 */
export async function listConversations(userId, opts = {}) {
  if (!userId) return { items: [] };
  const { pageSize = 30 } = opts;
  const q = query(
    collection(db, COLLECTION.MESSAGES),
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc'),
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
 * Subscribe to messages in a conversation (realtime).
 * @param {string} conversationId
 * @param {(messages) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeToMessages(conversationId, cb) {
  if (!conversationId || !isFirebaseConfigured()) return () => {};
  const q = query(
    collection(db, COLLECTION.MESSAGES, conversationId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('[chat] messages snapshot error:', err));
}

/**
 * Mark conversation as read (reset unread count for user).
 */
export async function markConversationRead(conversationId, userId) {
  const ref = doc(db, COLLECTION.MESSAGES, conversationId);
  await updateDoc(ref, {
    [`unreadCount.${userId}`]: 0,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get conversation by id.
 */
export async function getConversation(conversationId) {
  const snap = await getDoc(doc(db, COLLECTION.MESSAGES, conversationId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
