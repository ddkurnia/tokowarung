// ============================================
// TokOnline — Toast & Modal helpers (global)
// Aksesible, mobile-first. Tanpa dependency.
// ============================================

import { UI } from '../utils/constants.js';
import { el } from './ui.js';

// ----- TOAST -----
export function showToast(message, type = 'default', duration = UI.TOAST_DURATION_MS) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const toast = el('div', { className: 'toast toast-' + type, attrs: { role: 'alert' } }, [message]);
  root.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 200ms';
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

// Alias ringkas
export const toast = {
  success: (msg, dur) => showToast(msg, 'success', dur),
  error: (msg, dur) => showToast(msg, 'error', dur),
  warning: (msg, dur) => showToast(msg, 'warning', dur),
  info: (msg, dur) => showToast(msg, 'info', dur),
  default: (msg, dur) => showToast(msg, 'default', dur),
};

// ----- MODAL -----
let openModals = 0;

export function showModal({ title, content, variant = 'center', closable = true, onClose, actions = [] }) {
  const root = document.getElementById('modal-root');
  if (!root) return () => {};

  const backdrop = el('div', { className: 'modal-backdrop' });
  const panel = el('div', { className: 'modal-panel' + (variant === 'bottom' ? ' modal-panel--bottom' : '') });

  if (title) {
    const header = el('div', { className: 'modal-header' }, [
      el('h3', { className: 'modal-title', text: title }),
      closable ? el('button', {
        className: 'modal-close',
        attrs: { 'aria-label': 'Tutup' },
        html: '✕',
      }) : null,
    ]);
    panel.appendChild(header);
  }

  const body = el('div', { className: 'modal-body' });
  if (typeof content === 'string') body.innerHTML = content;
  else if (content instanceof Node) body.appendChild(content);
  panel.appendChild(body);

  if (actions.length > 0) {
    const footer = el('div', { className: 'modal-footer' });
    actions.forEach((a) => {
      const btn = el('button', {
        className: 'btn ' + (a.variant === 'primary' ? 'btn-primary' : a.variant === 'danger' ? 'btn-danger' : 'btn-secondary'),
        text: a.label,
        onClick: () => {
          if (a.onClick) a.onClick(close);
        },
      });
      footer.appendChild(btn);
    });
    panel.appendChild(footer);
  }

  root.appendChild(backdrop);
  root.appendChild(panel);
  root.setAttribute('data-open', 'true');
  openModals++;

  function close() {
    backdrop.remove();
    panel.remove();
    openModals = Math.max(0, openModals - 1);
    if (openModals === 0) root.setAttribute('data-open', 'false');
    if (onClose) onClose();
  }

  // Close handlers
  if (closable) {
    panel.querySelector('.modal-close')?.addEventListener('click', close);
  }
  backdrop.addEventListener('click', () => {
    if (closable) close();
  });

  // Trap focus (basic)
  panel.focus?.();

  return close;
}

// ----- CONFIRM DIALOG (Promise-based) -----
export function confirmDialog({ title = 'Konfirmasi', message = '', confirmLabel = 'Ya', cancelLabel = 'Batal', danger = false }) {
  return new Promise((resolve) => {
    let closeFn;
    const close = (val) => {
      closeFn?.();
      resolve(val);
    };
    closeFn = showModal({
      title,
      variant: 'center',
      closable: true,
      onClose: () => resolve(false),
      content: el('p', { text: message, style: { color: 'var(--color-text-2)' } }),
      actions: [
        { label: cancelLabel, variant: 'secondary', onClick: () => close(false) },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => close(true) },
      ],
    });
  });
}
