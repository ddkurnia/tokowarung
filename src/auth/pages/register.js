// ============================================
// TokOnline — Register Page
// Multi-role registration (BUYER, SELLER, COURIER).
// ADMIN/SUPER_ADMIN tidak bisa register dari sini.
// ============================================

import { el } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { registerUser } from '../../auth/authService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { isValidEmail, isValidIdPhone, normalizePhone } from '../../utils/helpers.js';

const ROLES = [
  { id: ROLE.BUYER, label: 'Pembeli', desc: 'Belanja dari toko lokal di sekitarmu', icon: '🛍️' },
  { id: ROLE.SELLER, label: 'Penjual / Toko', desc: 'Jualan online & kelola tokomu', icon: '🏪' },
  { id: ROLE.COURIER, label: 'Kurir', desc: 'Antar pesanan & dapat penghasilan', icon: '🛵' },
];

export default async function RegisterPage() {
  let selectedRole = ROLE.BUYER;

  const page = el('div', { className: 'auth-page' });
  page.appendChild(
    el('div', { className: 'auth-card' }, [
      el('div', { className: 'auth-card__brand' }, [
        el('div', { className: 'auth-card__logo', html: 'TOK<span>Online</span>' }),
        el('h1', { className: 'auth-card__title', text: 'Buat akun baru' }),
        el('p', { className: 'auth-card__subtitle', text: 'Pilih peran yang sesuai untuk mulai.' }),
      ]),

      el('div', { className: 'role-grid', id: 'roleGrid' }, ROLES.map((r) => {
        const card = el('button', {
          className: 'role-card' + (r.id === selectedRole ? ' is-active' : ''),
          attrs: { type: 'button', 'aria-pressed': r.id === selectedRole ? 'true' : 'false', 'data-role': r.id },
          onClick: () => selectRole(r.id),
        }, [
          el('div', { className: 'role-card__icon', html: r.icon }),
          el('div', { className: 'role-card__body' }, [
            el('h3', { className: 'role-card__label', text: r.label }),
            el('p', { className: 'role-card__desc', text: r.desc }),
          ]),
        ]);
        return card;
      })),

      el('form', {
        className: 'auth-form',
        listeners: { submit: handleSubmit },
      }, [
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Nama Lengkap', attrs: { for: 'name' } }),
          el('input', {
            className: 'input',
            attrs: { id: 'name', name: 'name', placeholder: 'Nama kamu', autocomplete: 'name', required: '', minlength: '3' },
          }),
        ]),
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Email', attrs: { for: 'email' } }),
          el('input', {
            className: 'input',
            attrs: { id: 'email', name: 'email', type: 'email', placeholder: 'nama@email.com', autocomplete: 'email', required: '' },
          }),
        ]),
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Nomor HP (Indonesia)', attrs: { for: 'phone' } }),
          el('input', {
            className: 'input',
            attrs: { id: 'phone', name: 'phone', type: 'tel', placeholder: '08xxxxxxxxxx', autocomplete: 'tel' },
          }),
          el('p', { className: 'field-hint', text: 'Format: 08xxx atau +62xxx. Untuk seller/kurir perlu verifikasi.' }),
        ]),
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Password', attrs: { for: 'password' } }),
          el('input', {
            className: 'input',
            attrs: { id: 'password', name: 'password', type: 'password', placeholder: 'Min. 6 karakter', autocomplete: 'new-password', required: '', minlength: '6' },
          }),
        ]),
        el('button', { className: 'btn btn-primary btn-block btn-lg', attrs: { type: 'submit' }, text: 'Daftar' }),
      ]),

      el('div', { className: 'auth-card__footer' }, [
        el('span', { className: 'text-sm text-muted', text: 'Sudah punya akun?' }),
        el('a', { className: 'btn-link', href: '#/login', text: 'Masuk' }),
      ]),

      el('p', { className: 'auth-legal-note text-xs text-muted', text: 'Dengan mendaftar, kamu menyetujui Ketentuan Layanan & Kebijakan Privasi TokOnline.' }),
    ])
  );

  return page;

  function selectRole(roleId) {
    selectedRole = roleId;
    page.querySelectorAll('.role-card').forEach((c) => {
      const isActive = c.dataset.role === roleId;
      c.classList.toggle('is-active', isActive);
      c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const password = form.password.value;

    if (name.length < 3) return toast.error('Nama minimal 3 karakter.');
    if (!isValidEmail(email)) return toast.error('Email tidak valid.');
    if (phone && !isValidIdPhone(phone)) return toast.error('Nomor HP tidak valid. Contoh: 08123456789.');
    if (password.length < 6) return toast.error('Password minimal 6 karakter.');

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Memproses…';

    try {
      const { profile } = await registerUser({
        email,
        password,
        displayName: name,
        role: selectedRole,
        phone: phone ? normalizePhone(phone) : '',
      });

      if (selectedRole === ROLE.BUYER) {
        toast.success('Pendaftaran berhasil! Selamat datang di TokOnline.');
        navigate('/');
      } else {
        toast.success('Pendaftaran berhasil! Akunmu perlu diverifikasi admin.');
        toast.info(selectedRole === ROLE.SELLER ? 'Lengkapi data toko di dashboard seller.' : 'Lengkapi data kurir di dashboard kurir.');
        navigate(selectedRole === ROLE.SELLER ? '/seller' : '/courier');
      }
    } catch (err) {
      console.error('[register] error:', err);
      toast.error(humanizeRegisterError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Daftar';
    }
  }
}

function humanizeRegisterError(err) {
  const code = err?.code || '';
  if (code.includes('email-already-in-use')) return 'Email sudah terdaftar. Silakan masuk.';
  if (code.includes('weak-password')) return 'Password terlalu lemah. Pakai kombinasi huruf & angka.';
  if (code.includes('network-request-failed')) return 'Koneksi internet bermasalah.';
  if (code.includes('operation-not-allowed')) return 'Pendaftaran email/password tidak aktif. Hubungi admin.';
  return err.message || 'Terjadi masalah saat mendaftar. Coba lagi.';
}
