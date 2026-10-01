// ============================================
// TokoWarung — Buyer Chat Detail Page (Phase 5)
// Realtime chat window via Firestore onSnapshot.
// ============================================

import { el, EmptyState, BuyerHeader } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { getConversation, subscribeToMessages, sendMessage, markConversationRead } from '../../services/chatService.js';
import { navigate } from '../../router/router.js';
import { formatRelativeTime, formatDate, initials } from '../../utils/helpers.js';

export default async function ChatDetailPage({ params, user, profile }) {
  if (!user) {
    navigate('/login?redirect=/chats/' + params.id);
    return el('div');
  }

  const conversationId = params.id;
  const page = el('div', { className: 'chat-page' });

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

  const main = el('main', { className: 'container mt-6 chat-main' });
  page.appendChild(main);

  const content = el('div', { className: 'chat-container' });
  content.appendChild(el('div', { className: 'skeleton skeleton-block' }));
  main.appendChild(content);

  let conversation = null;
  try {
    conversation = await getConversation(conversationId);
    if (!conversation) {
      content.replaceChildren(EmptyState({ icon: '❓', title: 'Conversation tidak ditemukan' }));
      return page;
    }

    // Verify access
    if (!conversation.participants?.includes(user.uid)) {
      content.replaceChildren(EmptyState({ icon: '🔒', title: 'Akses ditolak', desc: 'Kamu bukan participant di conversation ini.' }));
      return page;
    }

    const otherId = conversation.type === 'BUYER_SELLER' ? conversation.sellerId : conversation.courierId;
    const otherLabel = conversation.type === 'BUYER_SELLER' ? 'Toko' : 'Kurir';

    // Mark as read on open
    await markConversationRead(conversationId, user.uid);

    content.replaceChildren();

    // Header
    content.appendChild(
      el('div', { className: 'chat-header row gap-3' }, [
        el('button', { className: 'btn btn-ghost btn-sm', html: '←', onClick: () => navigate('/chats') }),
        el('div', { className: 'avatar', text: initials(otherLabel) }),
        el('div', {}, [
          el('p', { className: 'fw-600', text: otherLabel }),
          el('p', { className: 'text-xs text-muted', text: 'Order #' + conversation.orderId?.slice(-8).toUpperCase() }),
        ]),
      ])
    );

    // Order link
    content.appendChild(
      el('button', {
        className: 'btn btn-secondary btn-sm btn-block mt-2',
        text: 'Lihat Detail Order',
        onClick: () => navigate('/orders/' + conversation.orderId),
      })
    );

    // Messages container (will be populated by realtime listener)
    const messagesDiv = el('div', { className: 'chat-messages', id: 'chatMessages' });
    content.appendChild(messagesDiv);

    // Input
    let inputEl;
    const inputBar = el('div', { className: 'chat-input-bar' }, [
      inputEl = el('input', {
        className: 'input chat-input',
        attrs: { type: 'text', placeholder: 'Tulis pesan...', maxlength: '1000' },
        listeners: {
          keydown: (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          },
        },
      }),
      el('button', {
        className: 'btn btn-primary chat-send-btn',
        text: 'Kirim',
        onClick: handleSend,
      }),
    ]);
    content.appendChild(inputBar);

    // Subscribe to realtime messages
    const unsub = subscribeToMessages(conversationId, (messages) => {
      renderMessages(messagesDiv, messages, user.uid);
      // Scroll to bottom
      setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 50);
      // Mark read again if new messages came in
      markConversationRead(conversationId, user.uid).catch(() => {});
    });

    // Cleanup on navigate away
    const observer = new MutationObserver(() => {
      if (!document.body.contains(messagesDiv)) {
        unsub();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    async function handleSend() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      try {
        await sendMessage(conversationId, user.uid, text);
      } catch (err) {
        toast.error(err.message || 'Gagal kirim pesan.');
        inputEl.value = text; // restore
      }
    }
  } catch (err) {
    console.error('[chat detail] load error:', err);
    content.replaceChildren(EmptyState({ icon: '⚠️', title: 'Gagal memuat chat', desc: err.message }));
  }

  return page;
}

function renderMessages(container, messages, currentUserId) {
  container.replaceChildren();

  if (messages.length === 0) {
    container.appendChild(
      el('div', { className: 'chat-empty text-center text-muted' }, [
        el('p', { text: 'Belum ada pesan. Mulai percakapan dengan mengirim pesan pertama.' }),
      ])
    );
    return;
  }

  messages.forEach((m) => {
    const isMe = m.senderId === currentUserId;
    container.appendChild(
      el('div', { className: 'chat-message' + (isMe ? ' is-me' : '') }, [
        el('div', { className: 'chat-message__bubble' }, [
          el('p', { className: 'chat-message__text', text: m.text }),
          el('p', { className: 'chat-message__time', text: formatRelativeTime(m.createdAt) }),
        ]),
      ])
    );
  });
}
