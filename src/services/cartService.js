// ============================================
// TokOnline — Cart Service (Client-side)
// Cart disimpan di localStorage untuk guest, di Firestore utk logged-in user.
// Multi-seller support: cart dikelompokkan per seller.
// ============================================

import { db } from '../firebase/config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { COLLECTION } from '../utils/constants.js';

const GUEST_CART_KEY = 'tokonline.guestCart';

function readGuest() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeGuest(items) {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
}

/**
 * Tambahkan item ke cart. Jika user login, simpan ke Firestore; jika guest, ke localStorage.
 * @param {object} param
 * @param {object} param.user — firebase user
 * @param {object} param.profile — user profile
 * @param {{productId, sellerId, name, price, image, qty, weight, stock}} param.item
 */
export async function addToCart({ user, profile, item }) {
  if (!item?.productId || !item?.sellerId) throw new Error('Item tidak valid.');
  if (item.qty < 1) throw new Error('Jumlah minimal 1.');

  if (!user) {
    // Guest cart
    const items = readGuest();
    const existing = items.find((it) => it.productId === item.productId && it.sellerId === item.sellerId);
    if (existing) {
      existing.qty = Math.min(existing.qty + item.qty, item.stock || 99);
    } else {
      items.push({ ...item, qty: Math.min(item.qty, item.stock || 99) });
    }
    writeGuest(items);
    return items;
  }

  // Logged-in user: simpan ke Firestore
  const cartRef = doc(db, COLLECTION.CARTS, user.uid);
  const snap = await getDoc(cartRef);
  const existingItems = snap.exists() ? snap.data().items || [] : [];
  const existing = existingItems.find((it) => it.productId === item.productId && it.sellerId === item.sellerId);
  if (existing) {
    existing.qty = Math.min(existing.qty + item.qty, item.stock || 99);
  } else {
    existingItems.push({ ...item, qty: Math.min(item.qty, item.stock || 99) });
  }
  await setDoc(cartRef, { items: existingItems, updatedAt: serverTimestamp() }, { merge: true });
  return existingItems;
}

/**
 * Update quantity item di cart.
 */
export async function updateCartQty({ user, productId, sellerId, qty }) {
  if (user) {
    const cartRef = doc(db, COLLECTION.CARTS, user.uid);
    const snap = await getDoc(cartRef);
    if (!snap.exists()) return [];
    const items = (snap.data().items || []).map((it) => {
      if (it.productId === productId && it.sellerId === sellerId) {
        return { ...it, qty: Math.max(1, qty) };
      }
      return it;
    });
    await updateDoc(cartRef, { items, updatedAt: serverTimestamp() });
    return items;
  } else {
    const items = readGuest().map((it) => {
      if (it.productId === productId && it.sellerId === sellerId) {
        return { ...it, qty: Math.max(1, qty) };
      }
      return it;
    });
    writeGuest(items);
    return items;
  }
}

/**
 * Hapus item dari cart.
 */
export async function removeFromCart({ user, productId, sellerId }) {
  if (user) {
    const cartRef = doc(db, COLLECTION.CARTS, user.uid);
    const snap = await getDoc(cartRef);
    if (!snap.exists()) return [];
    const items = (snap.data().items || []).filter((it) => !(it.productId === productId && it.sellerId === sellerId));
    await updateDoc(cartRef, { items, updatedAt: serverTimestamp() });
    return items;
  } else {
    const items = readGuest().filter((it) => !(it.productId === productId && it.sellerId === sellerId));
    writeGuest(items);
    return items;
  }
}

/**
 * Get cart items.
 */
export async function getCart(user) {
  if (user) {
    const snap = await getDoc(doc(db, COLLECTION.CARTS, user.uid));
    return snap.exists() ? snap.data().items || [] : [];
  }
  return readGuest();
}

/**
 * Clear cart.
 */
export async function clearCart(user) {
  if (user) {
    await deleteDoc(doc(db, COLLECTION.CARTS, user.uid));
  } else {
    localStorage.removeItem(GUEST_CART_KEY);
  }
}

/**
 * Group cart items by seller.
 */
export function groupBySeller(cartItems) {
  const map = new Map();
  for (const it of cartItems) {
    if (!map.has(it.sellerId)) {
      map.set(it.sellerId, { sellerId: it.sellerId, sellerName: it.sellerName || '', items: [] });
    }
    map.get(it.sellerId).items.push(it);
  }
  return Array.from(map.values());
}

/**
 * Calculate cart totals per seller.
 */
export function calculateTotals(sellerGroup) {
  const subtotal = sellerGroup.items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const totalItems = sellerGroup.items.reduce((sum, it) => sum + it.qty, 0);
  return { subtotal, totalItems };
}
