// ============================================
// TokoWarung — Helper Utilities
// Fungsi-fungsi kecil yang dipakai lintas modul.
// ============================================

import { COLLECTION, ROLE, ROLE_LEVEL } from './constants.js';

// ----- Format Rupiah -----
export function formatRupiah(amount) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// ----- Format angka ringkas: 1.2k, 3.4M -----
export function formatCompact(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return (v / 1000).toFixed(1).replace('.0', '') + 'rb';
  if (v < 1_000_000_000) return (v / 1_000_000).toFixed(1).replace('.0', '') + 'jt';
  return (v / 1_000_000_000).toFixed(1).replace('.0', '') + 'M';
}

// ----- Format tanggal relatif (Indonesia) -----
export function formatRelativeTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Baru saja';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ----- Format tanggal lengkap -----
export function formatDate(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ----- Hitung jarak (haversine) dalam km -----
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ----- Estimasi ongkir sederhana (utk MVP) -----
export function estimateShipping(distanceKm, ratePerKm = 2000, baseFee = 5000) {
  const dist = Math.max(0, Number(distanceKm) || 0);
  return Math.round(baseFee + dist * ratePerKm);
}

// ----- Debounce -----
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ----- Generate ID sederhana (utk trace/local, BUKAN pengganti Firestore auto-id) -----
export function genLocalId(prefix = 'tmp') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ----- Validate email format -----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

// ----- Validate Indonesia phone -----
const ID_PHONE_RE = /^(\+62|62|0)8[1-9]\d{6,11}$/;
export function isValidIdPhone(phone) {
  return typeof phone === 'string' && ID_PHONE_RE.test(phone.replace(/[\s-]/g, ''));
}

// ----- Normalize phone to +62 -----
export function normalizePhone(phone) {
  const p = (phone || '').replace(/[\s-]/g, '');
  if (!p) return '';
  if (p.startsWith('+62')) return p;
  if (p.startsWith('62')) return '+' + p;
  if (p.startsWith('0')) return '+62' + p.slice(1);
  return p;
}

// ----- Validate file upload -----
export function validateImageFile(file, { maxMB = 5, allowed = ['image/jpeg', 'image/png', 'image/webp'] } = {}) {
  if (!file) return { ok: false, error: 'File tidak boleh kosong.' };
  if (!allowed.includes(file.type)) return { ok: false, error: 'Format file tidak didukung. Gunakan JPG/PNG/WEBP.' };
  if (file.size > maxMB * 1024 * 1024) return { ok: false, error: `Ukuran file maksimal ${maxMB}MB.` };
  return { ok: true };
}

// ----- Role permission helpers -----
export function hasRole(user, role) {
  return user?.role === role;
}

export function hasMinRole(user, role) {
  if (!user?.role) return false;
  return (ROLE_LEVEL[user.role] || 0) >= (ROLE_LEVEL[role] || 0);
}

export function canAccess(user, allowedRoles) {
  if (!user?.role) return false;
  return allowedRoles.includes(user.role);
}

// ----- Safe JSON parse -----
export function safeJson(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ----- Truncate text -----
export function truncate(str, len = 80) {
  if (typeof str !== 'string') return '';
  return str.length > len ? str.slice(0, len).trimEnd() + '…' : str;
}

// ----- Initials (untuk avatar) -----
export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
}

// ----- Firestore helper: create timestamp now() -----
import { serverTimestamp } from 'firebase/firestore';
export function nowTs() {
  return serverTimestamp();
}

// ----- Capitalize -----
export function capitalize(s = '') {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ----- Kebab-case slug -----
export function slugify(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

// ----- Group array by key -----
export function groupBy(arr, keyFn) {
  return (arr || []).reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

// ----- Collection helpers (re-export alias) -----
export { COLLECTION, ROLE };
