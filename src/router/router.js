// ============================================
// TokoWarung — Vanilla JS Hash Router
// Lightweight, no dependency. Mobile-first.
//
// Routing strategi:
// - Pakai hash routing (#/path) — paling simple untuk static hosting (Vercel).
// - Tidak butuh server rewrite rules.
// - Mendukung role-based guard.
// - Mendukung lazy loading page (utk code splitting).
// ============================================

import { ROUTE, ROLE } from '../utils/constants.js';
import { getCurrentUser } from '../auth/authService.js';

// ----- Route registry -----
// Setiap route: { path, role (array|null), loader (async fn returning HTML module) }
const routes = new Map();
let notFoundHandler = null;
let layoutWrapper = null;

/**
 * Daftarkan satu route.
 * @param {string} path — mis. '/', '/produk/:id', '/seller'
 * @param {string|string[]} roles — role yang boleh akses, atau null untuk public
 * @param {() => Promise<{default: (params) => HTMLElement | Promise<HTMLElement>}>} loader — dynamic import
 */
export function registerRoute(path, roles, loader) {
  routes.set(path, { path, roles: roles ? [].concat(roles) : null, loader });
}

/**
 * Set handler untuk 404 not found.
 */
export function setNotFound(handler) {
  notFoundHandler = handler;
}

/**
 * Set layout wrapper — dipakai untuk inject header/footer/bottom-nav.
 * @param {(child: HTMLElement, ctx: {path, params, role}) => HTMLElement} fn
 */
export function setLayout(fn) {
  layoutWrapper = fn;
}

// ----- Parse hash menjadi { path, params } -----
function parseHash() {
  let hash = window.location.hash.slice(1);
  if (!hash || hash === '/') hash = '/';
  // Hilangkan query string
  const [path, queryString] = hash.split('?');
  const queryParams = new URLSearchParams(queryString || '');
  return { path: path || '/', queryParams };
}

// ----- Match route berdasarkan pattern -----
function matchRoute(path) {
  // Exact match
  if (routes.has(path)) return { route: routes.get(path), params: {} };

  // Pattern match (untuk path dengan :param)
  for (const [pattern, route] of routes) {
    if (!pattern.includes(':')) continue;
    const regexStr = '^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$';
    const regex = new RegExp(regexStr);
    if (regex.test(path)) {
      const paramNames = (pattern.match(/:([^/]+)/g) || []).map((p) => p.slice(1));
      const values = path.match(regex).slice(1);
      const params = {};
      paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(values[i]);
      });
      return { route, params };
    }
  }
  return null;
}

// ----- Render current route -----
async function render() {
  const { path, queryParams } = parseHash();
  const matched = matchRoute(path);

  const app = document.getElementById('app');
  if (!app) return;

  // Tampilkan loading state
  app.innerHTML = '<div class="page-skeleton" aria-label="Memuat halaman"></div>';

  if (!matched) {
    if (notFoundHandler) {
      const el = await safeCall(notFoundHandler, { path, queryParams });
      app.replaceChildren(el || document.createElement('div'));
    } else {
      app.innerHTML = '<div class="empty-state"><h2>404</h2><p>Halaman tidak ditemukan.</p></div>';
    }
    return;
  }

  const { route, params } = matched;

  // Role guard
  const { user, profile } = getCurrentUser() || {};
  if (route.roles && !route.roles.includes(profile?.role)) {
    // Save intended path untuk redirect setelah login
    sessionStorage.setItem('intendedPath', path);
    window.location.hash = ROUTE.LOGIN + '?redirect=' + encodeURIComponent(path);
    return;
  }

  // Load page module
  let pageModule;
  try {
    pageModule = await route.loader();
  } catch (err) {
    console.error('[router] Gagal load module:', err);
    app.innerHTML =
      '<div class="empty-state"><h2>Gagal memuat halaman</h2><p>Terjadi masalah. Coba muat ulang.</p></div>';
    return;
  }

  const pageFactory = pageModule.default || pageModule;
  let pageEl;
  try {
    pageEl = await pageFactory({ params, queryParams, user, profile });
  } catch (err) {
    console.error('[router] Gagal render page:', err);
    app.innerHTML =
      '<div class="empty-state"><h2>Gagal memuat halaman</h2><p>Terjadi masalah. Coba muat ulang.</p></div>';
    return;
  }

  // Wrap with layout jika ada
  if (layoutWrapper) {
    const wrapped = await safeCall(layoutWrapper, pageEl, { path, params, queryParams, role: profile?.role });
    app.replaceChildren(wrapped || pageEl);
  } else {
    app.replaceChildren(pageEl || document.createElement('div'));
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function safeCall(fn, ...args) {
  try {
    return await fn(...args);
  } catch (err) {
    console.error('[router] Layout/loader error:', err);
    return null;
  }
}

// ----- Listen hash change -----
let initialized = false;
export function startRouter() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('hashchange', render);
  // Initial render
  if (!window.location.hash) {
    window.location.hash = ROUTE.HOME;
  } else {
    render();
  }
}

/**
 * Programmatic navigation.
 * @param {string} path — mis. '/produk/abc123'
 * @param {object} queryParams — { key: value }
 */
export function navigate(path, queryParams = {}) {
  let hash = path;
  const entries = Object.entries(queryParams);
  if (entries.length > 0) {
    const qs = new URLSearchParams(entries);
    hash += '?' + qs.toString();
  }
  window.location.hash = hash;
}

/**
 * Back navigation.
 */
export function goBack() {
  if (window.history.length > 1) window.history.back();
  else navigate(ROUTE.HOME);
}
