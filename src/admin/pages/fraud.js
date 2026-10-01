// ============================================
// TokoWarung — Admin Fraud Detection Page (Phase 6)
// ============================================

import { el, EmptyState } from '../../components/ui.js';
import { toast, confirmDialog } from '../../components/feedback.js';
import { logout } from '../../auth/authService.js';
import { getHighRiskUsers, detectDuplicateAccounts, calculateRiskScore } from '../../services/fraudService.js';
import { navigate } from '../../router/router.js';
import { ROLE, RISK_LEVEL } from '../../utils/constants.js';
import { formatDate } from '../../utils/helpers.js';

const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', href: '#/admin', icon: '📊' },
  { id: 'analytics', label: 'Analytics', href: '#/admin/analytics', icon: '📈' },
  { id: 'orders', label: 'Orders', href: '#/admin/orders', icon: '📦' },
  { id: 'users', label: 'Users', href: '#/admin/users', icon: '👥' },
  { id: 'moderation', label: 'Moderation', href: '#/admin/products', icon: '🛡️' },
  { id: 'reports', label: 'Reports', href: '#/admin/reports', icon: '🚨' },
  { id: 'disputes', label: 'Disputes', href: '#/admin/disputes', icon: '⚖️' },
  { id: 'incidents', label: 'Incidents', href: '#/admin/incidents', icon: '⚠️' },
  { id: 'fraud', label: 'Fraud', href: '#/admin/fraud', icon: '🔍' },
  { id: 'ads', label: 'Ads', href: '#/admin/ads', icon: '📢' },
  { id: 'finance', label: 'Finance', href: '#/admin/finance', icon: '💰' },
  { id: 'audit', label: 'Audit Logs', href: '#/admin/audit', icon: '📜' },
  { id: 'settings', label: 'Settings', href: '#/admin/settings', icon: '⚙️' },
];

const LEVEL_COLOR = {
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export default async function AdminFraudPage({ user, profile }) {
  if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(profile?.role)) {
    navigate('/login?redirect=/admin/fraud');
    return el('div');
  }

  const page = el('div', { className: 'admin-panel' });

  const sidebar = el('aside', { className: 'admin-panel__sidebar' });
  sidebar.appendChild(el('div', { className: 'admin-panel__brand', html: 'Toko<span>Warung</span> <small>Admin</small>' }));
  ADMIN_NAV.forEach((it) => {
    sidebar.appendChild(el('a', { className: 'nav-item' + (it.id === 'fraud' ? ' is-active' : ''), href: it.href }, [
      el('span', { className: 'nav-item__icon', html: it.icon }),
      el('span', { className: 'nav-item__label', text: it.label }),
    ]));
  });
  page.appendChild(sidebar);

  const main = el('main', { className: 'admin-panel__main' });
  main.appendChild(
    el('div', { className: 'dashboard__topbar' }, [
      el('h1', { className: 'dashboard__title', text: 'Fraud Detection' }),
      el('button', { className: 'btn btn-ghost btn-sm', html: '🚪 Keluar', onClick: handleLogout }),
    ])
  );

  const content = el('div', { className: 'admin-panel__content' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);
  page.appendChild(main);

  loadFraudData(content);

  return page;
}

async function loadFraudData(container) {
  try {
    const [highRisk, duplicates] = await Promise.all([
      getHighRiskUsers({ pageSize: 50 }),
      detectDuplicateAccounts(),
    ]);

    container.replaceChildren();

    // Stats
    container.appendChild(
      el('div', { className: 'stats-grid mb-6' }, [
        el('div', { className: 'stat-card stat-card--danger' }, [
          el('p', { className: 'stat-card__label', text: 'High Risk Users' }),
          el('p', { className: 'stat-card__value', text: String(highRisk.items.length) }),
        ]),
        el('div', { className: 'stat-card stat-card--warning' }, [
          el('p', { className: 'stat-card__label', text: 'Duplicate Phones' }),
          el('p', { className: 'stat-card__value', text: String(duplicates.items.length) }),
        ]),
      ])
    );

    // High risk users
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '🚨 High Risk Users' }),
        highRisk.items.length === 0
          ? EmptyState({ icon: '✅', title: 'Tidak ada high-risk user', desc: 'Semua user aman dari sinyal fraud.' })
          : el('div', {}, highRisk.items.map((r) => renderRiskCard(r))),
      ])
    );

    // Duplicate accounts
    container.appendChild(
      el('div', { className: 'card mt-6' }, [
        el('h2', { className: 'mb-4', text: '👥 Suspected Duplicate Accounts' }),
        duplicates.items.length === 0
          ? EmptyState({ icon: '✅', title: 'Tidak ada duplicate', desc: 'Tidak ada nomor HP yang dipakai multiple accounts.' })
          : el('div', {}, duplicates.items.map((d) =>
              el('div', { className: 'product-row' }, [
                el('div', { className: 'product-row__content' }, [
                  el('h3', { className: 'product-row__name', text: `Phone: ${d.key}` }),
                  el('p', { className: 'text-xs text-muted', text: d.accounts.map((a) => `${a.email} (${a.role})`).join(', ') }),
                ]),
                el('span', { className: 'badge badge-warning', text: `${d.accounts.length} accounts` }),
              ])
            )),
      ])
    );
  } catch (err) {
    console.error('[admin fraud] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat data', desc: err.message }));
  }
}

function renderRiskCard(risk) {
  return el('div', { className: 'card mb-4' }, [
    el('div', { className: 'row-between mb-3' }, [
      el('div', {}, [
        el('p', { className: 'fw-700', text: risk.user?.email || risk.userId.slice(0, 16) + '...' }),
        el('p', { className: 'text-xs text-muted', text: `${risk.user?.role || '?'} • Joined ${formatDate(risk.user?.createdAt)}` }),
      ]),
      el('div', { className: 'col gap-2' }, [
        el('span', { className: 'badge badge-' + (LEVEL_COLOR[risk.level] || 'info'), text: risk.level }),
        el('span', { className: 'badge badge-danger', text: `Score: ${risk.totalScore}` }),
      ]),
    ]),
    el('p', { className: 'text-sm fw-600 mb-2', text: 'Signals:' }),
    ...risk.signals.map((s) => el('div', { className: 'row-between mb-1' }, [
      el('span', { className: 'text-sm', text: s.signal.replace(/_/g, ' ') + ': ' + s.detail }),
      el('span', { className: 'badge badge-warning', text: `+${s.score}` }),
    ])),
    el('div', { className: 'row gap-2 mt-3' }, [
      el('button', {
        className: 'btn btn-secondary btn-sm',
        text: 'Suspend User',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Suspend user?',
            message: 'User akan di-suspend. Mereka tidak bisa login lagi.',
            confirmLabel: 'Ya, suspend',
            cancelLabel: 'Batal',
            danger: true,
          });
          if (!ok) return;
          toast.info('Manual suspend via Firebase Console: set users.{uid}.status = SUSPENDED');
        },
      }),
      el('button', {
        className: 'btn btn-ghost btn-sm',
        text: 'Recalc Score',
        onClick: async () => {
          try {
            const fresh = await calculateRiskScore(risk.userId);
            toast.success(`Recalculated: ${fresh.totalScore} (${fresh.level})`);
          } catch (err) { toast.error(err.message); }
        },
      }),
    ]),
  ]);
}

async function handleLogout() { try { await logout(); toast.success('Berhasil keluar.'); navigate('/login'); } catch { toast.error('Gagal keluar.'); } }
