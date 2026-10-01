// ============================================
// TokoWarung — Buyer Notifications Page (Phase 5)
// ============================================

import { el, EmptyState, BuyerHeader, BuyerBottomNav } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { subscribeToNotifications, markAllRead, markRead } from '../../services/notificationService.js';
import { navigate } from '../../router/router.js';
import { formatRelativeTime } from '../../utils/helpers.js';

export default async function NotificationsPage({ user, profile }) {
  if (!user) {
    navigate('/login?redirect=/notifications');
    return el('div');
  }

  const page = el('div', { className: 'buyer-notifications' });
  page.appendChild(
    BuyerHeader({
      location: profile?.location?.label || 'Jakarta',
      onSearch: (q) => navigate('/search', { q }),
      onCart: () => navigate('/cart'),
      onBell: () => navigate('/notifications'),
      cartCount: 0,
      notifCount: 0,
    })
  );

  const main = el('main', { className: 'container mt-6' });
  main.appendChild(
    el('div', { className: 'row-between mb-4' }, [
      el('h1', { text: 'Notifikasi' }),
      el('button', {
        className: 'btn btn-secondary btn-sm',
        text: 'Tandai Semua Dibaca',
        onClick: async () => {
          try {
            await markAllRead(user.uid);
            toast.success('Semua notifikasi ditandai dibaca.');
          } catch (err) { toast.error('Gagal update.'); }
        },
      }),
    ])
  );
  page.appendChild(main);

  const list = el('div', { className: 'notifications-list' });
  list.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(list);

  page.appendChild(BuyerBottomNav({ active: 'home' }));

  // Realtime subscription
  let unsub = null;
  setTimeout(() => {
    unsub = subscribeToNotifications(user.uid, (items) => {
      renderNotifications(list, items, user.uid);
    });
  }, 100);

  // Cleanup saat element di-unmount (best-effort)
  const observer = new MutationObserver(() => {
    if (!document.body.contains(list)) {
      if (unsub) { unsub(); unsub = null; }
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return page;
}

function renderNotifications(container, items, userId) {
  if (items.length === 0) {
    container.replaceChildren(
      EmptyState({ icon: '🔔', title: 'Belum ada notifikasi', desc: 'Notifikasi order, chat, dan promo akan muncul di sini.' })
    );
    return;
  }

  container.replaceChildren();
  items.forEach((n) => {
    container.appendChild(
      el('div', {
        className: 'card notification-item' + (n.read ? '' : ' is-unread'),
        onClick: async () => {
          if (!n.read) {
            try { await markRead(n.id); } catch (e) { /* ignore */ }
          }
          // Navigate based on data
          if (n.data?.orderId) navigate('/orders/' + n.data.orderId);
          else if (n.data?.conversationId) navigate('/chats/' + n.data.conversationId);
        },
      }, [
        el('div', { className: 'row gap-3' }, [
          el('div', { className: 'notification-item__icon', html: getNotifIcon(n.type) }),
          el('div', { className: 'notification-item__content' }, [
            el('p', { className: 'fw-600' + (n.read ? ' text-muted' : ''), text: n.title }),
            el('p', { className: 'text-sm text-muted', text: n.body }),
            el('p', { className: 'text-xs text-muted mt-1', text: formatRelativeTime(n.createdAt) }),
          ]),
          !n.read ? el('div', { className: 'notification-item__dot' }) : null,
        ]),
      ])
    );
  });
}

function getNotifIcon(type) {
  const icons = {
    ORDER: '📦',
    PAYMENT: '💳',
    DELIVERY: '🛵',
    PROMO: '🎯',
    SYSTEM: '⚙️',
    CHAT: '💬',
    REPORT: '🚨',
  };
  return icons[type] || '🔔';
}
