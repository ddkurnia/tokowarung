// ============================================
// TokoWarung — Analytics Service (Phase 6)
// ============================================
// Admin & seller analytics. Client-side computation (no Cloud Function).
// For high-volume data, would need MapReduce — but for MVP works fine.
// ============================================

import { db } from '../firebase/config.js';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { COLLECTION, ORDER_STATUS, ROLE } from '../utils/constants.js';

// ============================================
// ADMIN ANALYTICS
// ============================================

/**
 * Get platform-wide overview stats.
 */
export async function getPlatformOverview() {
  const [usersSnap, ordersSnap, productsSnap, sellersSnap, couriersSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTION.USERS), limit(10000))),
    getDocs(query(collection(db, COLLECTION.ORDERS), limit(10000))),
    getDocs(query(collection(db, COLLECTION.PRODUCTS), limit(10000))),
    getDocs(query(collection(db, COLLECTION.SELLERS), limit(10000))),
    getDocs(query(collection(db, COLLECTION.COURIERS), limit(10000))),
  ]);

  const users = usersSnap.docs.map((d) => d.data());
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Calculate GMV (sum of all delivered/completed orders)
  const completedOrders = orders.filter((o) =>
    [ORDER_STATUS.DELIVERED, ORDER_STATUS.PAID, ORDER_STATUS.PREPARING, ORDER_STATUS.READY_FOR_PICKUP, ORDER_STATUS.COURIER_ASSIGNED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.DELIVERING, ORDER_STATUS.ARRIVED].includes(o.orderStatus)
  );
  const gmv = completedOrders.reduce((s, o) => s + (o.total || 0), 0);

  // Today's stats
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter((o) => {
    const createdAt = o.timestamps?.createdAt?.toDate ? o.timestamps.createdAt.toDate() : new Date(o.timestamps?.createdAt);
    return createdAt >= todayStart;
  });
  const todayGMV = todayOrders.reduce((s, o) => s + (o.total || 0), 0);

  // Last 30 days GMV
  const last30 = new Date(); last30.setDate(last30.getDate() - 30);
  const last30Orders = orders.filter((o) => {
    const createdAt = o.timestamps?.createdAt?.toDate ? o.timestamps.createdAt.toDate() : new Date(o.timestamps?.createdAt);
    return createdAt >= last30;
  });
  const last30GMV = last30Orders.reduce((s, o) => s + (o.total || 0), 0);

  return {
    totalUsers: users.length,
    totalBuyers: users.filter((u) => u.role === ROLE.BUYER).length,
    totalSellers: sellersSnap.size,
    totalCouriers: couriersSnap.size,
    totalProducts: productsSnap.size,
    totalOrders: orders.length,
    completedOrders: completedOrders.length,
    pendingOrders: orders.filter((o) => o.orderStatus === ORDER_STATUS.PENDING_PAYMENT).length,
    gmv,
    todayGMV,
    todayOrders: todayOrders.length,
    last30GMV,
    last30Orders: last30Orders.length,
    cancelledOrders: orders.filter((o) => o.orderStatus === ORDER_STATUS.CANCELLED).length,
  };
}

/**
 * Get top sellers by GMV.
 */
export async function getTopSellers(limitCount = 10) {
  const ordersSnap = await getDocs(query(collection(db, COLLECTION.ORDERS), limit(10000)));
  const sellerStats = {};

  ordersSnap.docs.forEach((d) => {
    const o = d.data();
    if (!o.sellerId) return;
    if (!sellerStats[o.sellerId]) {
      sellerStats[o.sellerId] = { sellerId: o.sellerId, totalGMV: 0, orderCount: 0, sellerName: o.sellerName || 'Unknown' };
    }
    sellerStats[o.sellerId].totalGMV += o.total || 0;
    sellerStats[o.sellerId].orderCount += 1;
  });

  return Object.values(sellerStats)
    .sort((a, b) => b.totalGMV - a.totalGMV)
    .slice(0, limitCount);
}

/**
 * Get top products by soldCount.
 */
export async function getTopProducts(limitCount = 10) {
  const snap = await getDocs(query(collection(db, COLLECTION.PRODUCTS), orderBy('soldCount', 'desc'), limit(limitCount)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get order growth (last 30 days, by day).
 */
export async function getOrderGrowth(days = 30) {
  const since = new Date(); since.setDate(since.getDate() - days);
  const snap = await getDocs(query(collection(db, COLLECTION.ORDERS), limit(10000)));
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Group by day
  const byDay = {};
  for (let i = 0; i < days; i++) {
    const date = new Date(); date.setDate(date.getDate() - i); date.setHours(0, 0, 0, 0);
    byDay[date.toISOString().split('T')[0]] = { date: date.toISOString().split('T')[0], count: 0, gmv: 0 };
  }

  orders.forEach((o) => {
    const createdAt = o.timestamps?.createdAt?.toDate ? o.timestamps.createdAt.toDate() : new Date(o.timestamps?.createdAt);
    if (createdAt >= since) {
      const dateKey = createdAt.toISOString().split('T')[0];
      if (byDay[dateKey]) {
        byDay[dateKey].count++;
        byDay[dateKey].gmv += o.total || 0;
      }
    }
  });

  return Object.values(byDay).reverse();
}

// ============================================
// SELLER ANALYTICS
// ============================================

/**
 * Get seller-specific stats.
 */
export async function getSellerAnalytics(sellerId) {
  if (!sellerId) return null;

  const [ordersSnap, productsSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTION.ORDERS), where('sellerId', '==', sellerId), limit(10000))),
    getDocs(query(collection(db, COLLECTION.PRODUCTS), where('sellerId', '==', sellerId), limit(1000))),
  ]);

  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Revenue
  const completedOrders = orders.filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED);
  const totalRevenue = completedOrders.reduce((s, o) => s + (o.subtotal || 0), 0);

  // Today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter((o) => {
    const createdAt = o.timestamps?.createdAt?.toDate ? o.timestamps.createdAt.toDate() : new Date(o.timestamps?.createdAt);
    return createdAt >= todayStart;
  });
  const todayRevenue = todayOrders.filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED).reduce((s, o) => s + (o.subtotal || 0), 0);

  // Top products
  const topProducts = [...products].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0)).slice(0, 5);

  // Low stock products
  const lowStockProducts = products.filter((p) => (p.stock || 0) < 10 && p.status === 'APPROVED').slice(0, 5);

  // Last 30 days revenue trend
  const last30 = new Date(); last30.setDate(last30.getDate() - 30);
  const last30Orders = orders.filter((o) => {
    const createdAt = o.timestamps?.createdAt?.toDate ? o.timestamps.createdAt.toDate() : new Date(o.timestamps?.createdAt);
    return createdAt >= last30;
  });

  return {
    totalOrders: orders.length,
    completedOrders: completedOrders.length,
    pendingOrders: orders.filter((o) => o.orderStatus === ORDER_STATUS.PENDING_PAYMENT).length,
    cancelledOrders: orders.filter((o) => o.orderStatus === ORDER_STATUS.CANCELLED).length,
    totalRevenue,
    todayOrders: todayOrders.length,
    todayRevenue,
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.isActive && p.status === 'APPROVED').length,
    lowStockCount: lowStockProducts.length,
    avgOrderValue: completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0,
    topProducts,
    lowStockProducts,
    recentOrders: last30Orders.slice(0, 10),
  };
}

/**
 * Get revenue trend for seller (last N days, by day).
 */
export async function getSellerRevenueTrend(sellerId, days = 30) {
  if (!sellerId) return [];
  const since = new Date(); since.setDate(since.getDate() - days);
  const snap = await getDocs(query(collection(db, COLLECTION.ORDERS), where('sellerId', '==', sellerId), limit(10000)));
  const orders = snap.docs.map((d) => d.data());

  const byDay = {};
  for (let i = 0; i < days; i++) {
    const date = new Date(); date.setDate(date.getDate() - i); date.setHours(0, 0, 0, 0);
    byDay[date.toISOString().split('T')[0]] = { date: date.toISOString().split('T')[0], revenue: 0, orders: 0 };
  }

  orders.forEach((o) => {
    const createdAt = o.timestamps?.createdAt?.toDate ? o.timestamps.createdAt.toDate() : new Date(o.timestamps?.createdAt);
    if (createdAt >= since) {
      const dateKey = createdAt.toISOString().split('T')[0];
      if (byDay[dateKey]) {
        byDay[dateKey].orders++;
        if (o.orderStatus === ORDER_STATUS.DELIVERED) {
          byDay[dateKey].revenue += o.subtotal || 0;
        }
      }
    }
  });

  return Object.values(byDay).reverse();
}
