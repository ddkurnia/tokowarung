// ============================================
// TokOnline — 404 Page
// ============================================

import { el, EmptyState } from '../components/ui.js';
import { navigate } from '../router/router.js';

export default async function NotFoundPage() {
  return el('div', { className: 'container full-vh' }, [
    EmptyState({
      icon: '🧭',
      title: 'Halaman tidak ditemukan',
      desc: 'URL yang kamu kunjungi tidak tersedia atau sudah dipindahkan.',
      action: el('div', { className: 'row gap-2' }, [
        el('button', { className: 'btn btn-primary', text: 'Kembali ke Beranda', onClick: () => navigate('/') }),
        el('button', { className: 'btn btn-secondary', text: 'Kembali', onClick: () => window.history.back() }),
      ]),
    }),
  ]);
}
