// ============================================
// TokoWarung — Global Constants & Enums
// ============================================
// Semua enum status, role, dan konstanta sistem ada di sini.
// SATU source of truth — jangan hardcode string status di tempat lain.
// ============================================

// ----- USER ROLES -----
export const ROLE = Object.freeze({
  BUYER: 'BUYER',
  SELLER: 'SELLER',
  COURIER: 'COURIER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
});

export const ALL_ROLES = Object.values(ROLE);

// Role hierarchy untuk permission checks (angka lebih tinggi = lebih kuat)
export const ROLE_LEVEL = Object.freeze({
  [ROLE.BUYER]: 10,
  [ROLE.SELLER]: 20,
  [ROLE.COURIER]: 20,
  [ROLE.ADMIN]: 90,
  [ROLE.SUPER_ADMIN]: 100,
});

// ----- USER STATUS -----
export const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
});

// ----- SELLER VERIFICATION STATUS -----
export const SELLER_VERIFICATION = Object.freeze({
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
});

// ----- PRODUCT STATUS (moderation pipeline) -----
export const PRODUCT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
});

// ----- ORDER STATUS -----
export const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  SELLER_CONFIRMED: 'SELLER_CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  COURIER_ASSIGNED: 'COURIER_ASSIGNED',
  COURIER_GOING_TO_PICKUP: 'COURIER_GOING_TO_PICKUP',
  PICKED_UP: 'PICKED_UP',
  DELIVERING: 'DELIVERING',
  ARRIVED: 'ARRIVED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
});

// ----- COURIER STATUS -----
export const COURIER_STATUS = Object.freeze({
  OFFLINE: 'OFFLINE',
  ONLINE_AVAILABLE: 'ONLINE_AVAILABLE',
  ORDER_OFFERED: 'ORDER_OFFERED',
  ACCEPTED: 'ACCEPTED',
  GOING_TO_PICKUP: 'GOING_TO_PICKUP',
  ARRIVED_PICKUP: 'ARRIVED_PICKUP',
  PICKED_UP: 'PICKED_UP',
  DELIVERING: 'DELIVERING',
  ARRIVED_CUSTOMER: 'ARRIVED_CUSTOMER',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  SUSPENDED: 'SUSPENDED',
});

// ----- PAYMENT STATUS -----
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
});

// ----- PAYMENT METHODS -----
export const PAYMENT_METHOD = Object.freeze({
  COD: 'COD',
  QRIS: 'QRIS',
  VA: 'VIRTUAL_ACCOUNT',
  EWALLET: 'EWALLET',
  GATEWAY: 'PAYMENT_GATEWAY',
});

// ----- REFUND STATUS -----
export const REFUND_STATUS = Object.freeze({
  REQUESTED: 'REQUESTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
});

// ----- REPORT PRIORITY -----
export const REPORT_PRIORITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

// ----- SELLER VIOLATION LEVEL -----
export const VIOLATION_LEVEL = Object.freeze({
  WARNING: 'WARNING',
  RESTRICTED: 'RESTRICTED',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
});

// ----- RISK SCORE (anti-fraud) -----
export const RISK_LEVEL = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

// ----- TRANSACTION TYPES (ledger) -----
export const TX_TYPE = Object.freeze({
  ORDER_PAYMENT: 'ORDER_PAYMENT',
  SELLER_PAYOUT: 'SELLER_PAYOUT',
  COURIER_PAYOUT: 'COURIER_PAYOUT',
  PLATFORM_COMMISSION: 'PLATFORM_COMMISSION',
  SELLER_FEE: 'SELLER_FEE',
  BUYER_SERVICE_FEE: 'BUYER_SERVICE_FEE',
  COURIER_FEE: 'COURIER_FEE',
  PROMOTION_SUBSIDY: 'PROMOTION_SUBSIDY',
  PAYMENT_FEE: 'PAYMENT_FEE',
  REFUND: 'REFUND',
  ADJUSTMENT: 'ADJUSTMENT',
  WITHDRAWAL: 'WITHDRAWAL',
  COD_COLLECTED: 'COD_COLLECTED',
  COD_SETTLED: 'COD_SETTLED',
});

export const TX_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SETTLED: 'SETTLED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
});

// ----- NOTIFICATION TYPE -----
export const NOTIF_TYPE = Object.freeze({
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  DELIVERY: 'DELIVERY',
  PROMO: 'PROMO',
  SYSTEM: 'SYSTEM',
  CHAT: 'CHAT',
  REPORT: 'REPORT',
});

// ----- FIRESTORE COLLECTION NAMES -----
// Single source of truth — semua service pakai nama collection dari sini.
export const COLLECTION = Object.freeze({
  USERS: 'users',
  SELLERS: 'sellers',
  COURIERS: 'couriers',
  STORES: 'stores',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  INVENTORY: 'inventory',
  CARTS: 'carts',
  ORDERS: 'orders',
  ORDER_ITEMS: 'orderItems',
  PAYMENTS: 'payments',
  TRANSACTIONS: 'transactions',
  SELLER_WALLETS: 'sellerWallets',
  COURIER_WALLETS: 'courierWallets',
  SETTLEMENTS: 'settlements',
  WITHDRAWALS: 'withdrawals',
  DELIVERIES: 'deliveries',
  DELIVERY_EVENTS: 'deliveryEvents',
  REVIEWS: 'reviews',
  REPORTS: 'reports',
  DISPUTES: 'disputes',
  INCIDENTS: 'incidents',
  VIOLATIONS: 'violations',
  NOTIFICATIONS: 'notifications',
  MESSAGES: 'messages',
  PROMOTIONS: 'promotions',
  COUPONS: 'coupons',
  ADS: 'ads',
  AUDIT_LOGS: 'auditLogs',
  SETTINGS: 'settings',
  ZONES: 'zones',
  REPORT_ABUSE: 'reportAbuse',
});

// ----- DEFAULT CATEGORIES (initial seed) -----
export const DEFAULT_CATEGORIES = [
  { id: 'sembako', name: 'Sembako', icon: '🛒', sortOrder: 1 },
  { id: 'kuliner', name: 'Kuliner', icon: '🍲', sortOrder: 2 },
  { id: 'fashion', name: 'Fashion', icon: '👕', sortOrder: 3 },
  { id: 'elektronik', name: 'Elektronik', icon: '📱', sortOrder: 4 },
  { id: 'kecantikan', name: 'Kecantikan', icon: '💄', sortOrder: 5 },
  { id: 'rumah-tangga', name: 'Rumah Tangga', icon: '🏠', sortOrder: 6 },
  { id: 'jasa', name: 'Jasa', icon: '🛠️', sortOrder: 7 },
  { id: 'umkm', name: 'UMKM', icon: '🏪', sortOrder: 8 },
  { id: 'lainnya', name: 'Lainnya', icon: '📦', sortOrder: 99 },
];

// ----- ROUTE PATHS -----
export const ROUTE = Object.freeze({
  // Public
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  SEARCH: '/search',
  PRODUCT_DETAIL: '/produk/:id',
  STORE_PAGE: '/toko/:id',
  LEGAL_TOS: '/legal/tos',
  LEGAL_PRIVACY: '/legal/privacy',

  // Buyer
  BUYER_CART: '/cart',
  BUYER_CHECKOUT: '/checkout',
  BUYER_ORDERS: '/orders',
  BUYER_ORDER_DETAIL: '/orders/:id',
  BUYER_WISHLIST: '/wishlist',
  BUYER_PROFILE: '/profile',

  // Seller
  SELLER_DASHBOARD: '/seller',
  SELLER_PRODUCTS: '/seller/products',
  SELLER_NEW_PRODUCT: '/seller/products/new',
  SELLER_ORDERS: '/seller/orders',
  SELLER_FINANCE: '/seller/finance',
  SELLER_SETTINGS: '/seller/settings',

  // Courier
  COURIER_DASHBOARD: '/courier',
  COURIER_WALLET: '/courier/wallet',
  COURIER_HISTORY: '/courier/history',

  // Admin
  ADMIN_DASHBOARD: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_PRODUCTS: '/admin/products',
  ADMIN_ORDERS: '/admin/orders',
  ADMIN_FINANCE: '/admin/finance',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_AUDIT: '/admin/audit',
});

// ----- DEFAULT APP SETTINGS (akan di-override dari Firestore settings collection) -----
export const DEFAULT_SETTINGS = Object.freeze({
  platformCommissionPercent: 3,
  sellerFeePercent: 0,
  buyerServiceFeeFlat: 1000,
  courierFeePerKm: 2000,
  minimumWithdrawal: 50000,
  maximumCOD: 500000,
  deliveryRadiusKm: 10,
  orderTimeoutMinutes: 30,
  courierOfferTimeoutSeconds: 30,
  sellerReviewRequired: true,
  maintenanceMode: false,
  minimumSellerRating: 4.0,
  minimumCourierRating: 4.0,
});

// ----- UI CONSTANTS -----
export const UI = Object.freeze({
  PAGE_SIZE: 20,
  MAX_PRODUCT_IMAGES: 8,
  MAX_FILE_SIZE_MB: 5,
  MAX_PRODUCT_NAME_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 3000,
  TOAST_DURATION_MS: 3500,
  SKELETON_MIN_DELAY_MS: 200, // min display biar gak "flicker"
});
