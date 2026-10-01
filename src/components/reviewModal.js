// ============================================
// TokoWarung — Review Modal (reusable)
// ============================================
// Modal untuk buyer rate seller/product/courier (1-5 stars + comment).
// Trigger dari order detail setelah DELIVERED.
// ============================================

import { el } from './ui.js';
import { toast, showModal } from './feedback.js';
import { createReview } from '../services/reviewService.js';

/**
 * Show review modal.
 * @param {object} param
 * @param {object} param.user - firebase user
 * @param {string} param.orderId
 * @param {string} param.targetType - 'PRODUCT' | 'SELLER' | 'COURIER'
 * @param {string} param.targetId
 * @param {string} param.targetName - display name
 */
export function showReviewModal({ user, orderId, targetType, targetId, targetName = '' }) {
  if (!user) {
    toast.error('Login dulu untuk memberikan rating.');
    return;
  }

  let rating = 0;
  let commentInput;
  const starRow = el('div', { className: 'star-input' });

  // Render 5 stars (clickable)
  for (let i = 1; i <= 5; i++) {
    const star = el('button', {
      className: 'star-input__star',
      attrs: { 'aria-label': `${i} stars`, 'data-value': String(i) },
      html: '★',
      onClick: () => {
        rating = i;
        starRow.querySelectorAll('.star-input__star').forEach((s, idx) => {
          s.classList.toggle('is-active', idx < i);
        });
      },
    });
    starRow.appendChild(star);
  }

  showModal({
    title: `Beri Rating ${targetType.toLowerCase()}`,
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: `Kamu memberi rating untuk: ${targetName || targetId.slice(0, 8) + '...'}` }),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Rating (wajib)' }),
        starRow,
        el('p', { className: 'text-xs text-muted mt-2', id: 'ratingHint', text: 'Klik bintang untuk pilih rating (1-5)' }),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Komentar (opsional, maks 500 karakter)' }),
        commentInput = el('textarea', {
          className: 'textarea',
          attrs: { placeholder: 'Ceritakan pengalamanmu. Apa yang baik? Apa yang perlu diperbaiki?', rows: '4', maxlength: '500' },
        }),
      ]),

      el('p', { className: 'text-xs text-muted', text: 'Rating bersifat jujur dan adil. Penyalahgunaan rating dapat dikenakan sanksi.' }),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Kirim Rating',
        variant: 'primary',
        onClick: async (c) => {
          if (rating === 0) return toast.error('Pilih rating (1-5 bintang).');
          const comment = commentInput.value.trim();
          try {
            await createReview({
              buyerId: user.uid,
              orderId,
              targetType,
              targetId,
              rating,
              comment,
            });
            toast.success('Rating terkirim! Terima kasih atas feedback.');
            c();
          } catch (err) {
            console.error('[reviewModal] submit error:', err);
            toast.error(err.message || 'Gagal kirim rating.');
          }
        },
      },
    ],
  });
}
