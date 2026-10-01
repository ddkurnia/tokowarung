// ============================================
// TokoWarung — Buyer Chats List Page (Phase 5)
// ============================================

import { el, EmptyState, BuyerHeader, BuyerBottomNav } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { listConversations } from '../../services/chatService.js';
import { navigate } from '../../router/router.js';
import { formatRelativeTime, initials } from '../../utils/helpers.js';

export default async function ChatsPage({ user, profile }) {
  if (!user) {
    navigate('/login?redirect=/chats');
    return el('div');
  }

  const page = el('div', { className: 'buyer-chats' });
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
  main.appendChild(el('h1', { className: 'mb-4', text: 'Percakapan' }));
  page.appendChild(main);

  const list = el('div', { className: 'chats-list' });
  list.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(list);

  page.appendChild(BuyerBottomNav({ active: 'home' }));

  loadConversations(list, user.uid);

  return page;
}

async function loadConversations(container, userId) {
  try {
    const { items } = await listConversations(userId);
    if (items.length === 0) {
      container.replaceChildren(
        EmptyState({
          icon: '💬',
          title: 'Belum ada percakapan',
          desc: 'Chat dengan seller atau kurir akan muncul di sini. Mulai chat dari halaman order detail.',
          action: el('button', { className: 'btn btn-primary', text: 'Lihat Pesanan', onClick: () => navigate('/orders') }),
        })
      );
      return;
    }

    container.replaceChildren();
    items.forEach((c) => container.appendChild(renderChatCard(c, userId)));
  } catch (err) {
    console.error('[chats] load error:', err);
    container.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat percakapan', desc: err.message }));
  }
}

function renderChatCard(conv, userId) {
  const otherId = conv.type === 'BUYER_SELLER' ? conv.sellerId : conv.courierId;
  const otherLabel = conv.type === 'BUYER_SELLER' ? 'Toko' : 'Kurir';
  const unread = conv.unreadCount?.[userId] || 0;

  return el('div', {
    className: 'chat-list-item' + (unread > 0 ? ' is-unread' : ''),
    onClick: () => navigate('/chats/' + conv.id),
  }, [
    el('div', { className: 'avatar', text: initials(otherLabel) }),
    el('div', { className: 'chat-list-item__content' }, [
      el('div', { className: 'row-between' }, [
        el('p', { className: 'fw-600', text: otherLabel }),
        el('p', { className: 'text-xs text-muted', text: formatRelativeTime(conv.lastMessageAt) }),
      ]),
      el('p', { className: 'text-sm text-muted' + (unread > 0 ? ' fw-600' : ''), text: conv.lastMessage || 'Mulai chat...' }),
    ]),
    unread > 0 ? el('span', { className: 'badge badge-danger', text: String(unread) }) : null,
  ]);
}
