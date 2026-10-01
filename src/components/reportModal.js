// ============================================
// TokoWarung — Report Modal (reusable)
// ============================================
// Generic modal untuk buyer report product/seller/courier/order/review/chat.
// Trigger dari mana pun (product detail, store page, order detail, dll).
// ============================================

import { el } from './ui.js';
import { toast, showModal } from './feedback.js';
import { createReport } from '../services/reportService.js';
import { uploadImageWithRetry } from '../services/storageService.js';
import { REPORT_PRIORITY } from '../utils/constants.js';

const REPORT_REASONS = {
  PRODUCT: ['Produk terlarang', 'Foto tidak sesuai', 'Deskripsi menipu', 'Harga tidak masuk akal', 'Produk palsu', 'Spam', 'Lainnya'],
  SELLER: ['Penipuan', 'Tidak mengirim', 'Respons lambat', 'Produk dilarang', 'Spam', 'Lainnya'],
  COURIER: ['Tidak mengantar', 'Lambat', 'Barang rusak', 'Kurir hilang', 'COD tidak disetor', 'Penipuan', 'Lainnya'],
  ORDER: ['Masalah order', 'Refund tidak diproses', 'Seller tidak responsif', 'Kurir bermasalah', 'Lainnya'],
  REVIEW: ['Review palsu', 'Bahasa kasar', 'Spam', 'Lainnya'],
  CHAT: ['Bahasa kasar', 'Penipuan', 'Spam', 'Ancaman', 'Lainnya'],
};

/**
 * Show report modal.
 * @param {object} param
 * @param {object} param.user - firebase user
 * @param {string} param.type - PRODUCT | SELLER | COURIER | ORDER | REVIEW | CHAT
 * @param {string} param.targetId - id of the target being reported
 * @param {string} param.targetName - display name for header
 */
export function showReportModal({ user, type, targetId, targetName = '' }) {
  if (!user) {
    toast.error('Login dulu untuk melaporkan.');
    return;
  }
  if (!REPORT_REASONS[type]) {
    toast.error('Tipe report tidak valid.');
    return;
  }

  let reasonSelect, descriptionInput, fileInput, selectedFiles = [];

  showModal({
    title: `Laporkan ${type.toLowerCase()}`,
    variant: 'bottom',
    closable: true,
    content: el('div', {}, [
      el('p', { className: 'text-sm text-muted mb-4', text: `Kamu melaporkan: ${targetName || targetId.slice(0, 8) + '...'}` }),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Alasan', attrs: { for: 'reason' } }),
        reasonSelect = el('select', { className: 'select', attrs: { id: 'reason' } }, [
          el('option', { attrs: { value: '' } }, ['Pilih alasan...']),
          ...REPORT_REASONS[type].map((r) => el('option', { attrs: { value: r } }, [r])),
        ]),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Deskripsi (wajib, min 10 karakter)' }),
        descriptionInput = el('textarea', {
          className: 'textarea',
          attrs: { placeholder: 'Jelaskan masalahnya secara detail. Semakin spesifik, semakin cepat admin bisa verify.', rows: '4', minlength: '10', required: '' },
        }),
      ]),

      el('div', { className: 'field mb-4' }, [
        el('label', { className: 'field-label', text: 'Bukti (foto/screenshot, opsional, maks 3 file)' }),
        fileInput = el('input', {
          className: 'input',
          attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: '' },
          listeners: {
            change: (e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 3) {
                toast.error('Maksimal 3 file.');
                e.target.value = '';
                selectedFiles = [];
                return;
              }
              for (const f of files) {
                if (f.size > 5 * 1024 * 1024) {
                  toast.error(`File ${f.name} lebih dari 5MB.`);
                  e.target.value = '';
                  selectedFiles = [];
                  return;
                }
              }
              selectedFiles = files;
            },
          },
        }),
      ]),

      el('p', { className: 'text-xs text-muted', text: 'Report kamu akan dilihat admin. Priority auto-set: HIGH untuk kata kunci seperti "narkoba", "senjata", "penipuan".' }),
    ]),
    actions: [
      { label: 'Batal', variant: 'secondary', onClick: (c) => c() },
      {
        label: 'Kirim Laporan',
        variant: 'primary',
        onClick: async (c) => {
          const reason = reasonSelect.value;
          const description = descriptionInput.value.trim();
          if (!reason) return toast.error('Pilih alasan dulu.');
          if (description.length < 10) return toast.error('Deskripsi minimal 10 karakter.');

          try {
            // Upload evidence (jika ada)
            const evidence = [];
            for (const file of selectedFiles) {
              const result = await uploadImageWithRetry(file, { folder: 'tokowarung/reportEvidence' });
              evidence.push({ url: result.secureUrl, publicId: result.publicId });
            }

            await createReport({
              reporterId: user.uid,
              type,
              targetId,
              reason,
              description,
              priority: REPORT_PRIORITY.MEDIUM,
              evidence,
            });

            toast.success('Laporan terkirim! Admin akan review dalam 1-3 hari kerja.');
            c();
          } catch (err) {
            console.error('[reportModal] submit error:', err);
            toast.error(err.message || 'Gagal kirim laporan. Coba lagi.');
          }
        },
      },
    ],
  });
}
