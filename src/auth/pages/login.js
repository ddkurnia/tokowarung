// ============================================
// TokOnline — Login Page
// Mobile-first, accessible.
// ============================================

import { el } from '../../components/ui.js';
import { toast } from '../../components/feedback.js';
import { loginWithEmail, loginWithGoogle, resetPassword } from '../../auth/authService.js';
import { navigate } from '../../router/router.js';
import { ROLE } from '../../utils/constants.js';
import { isValidEmail } from '../../utils/helpers.js';

export default async function LoginPage({ queryParams }) {
  const redirect = queryParams.get('redirect') || '/';

  const page = el('div', { className: 'auth-page' });
  page.appendChild(
    el('div', { className: 'auth-card' }, [
      el('div', { className: 'auth-card__brand' }, [
        el('div', { className: 'auth-card__logo', html: 'TOK<span>Online</span>' }),
        el('h1', { className: 'auth-card__title', text: 'Masuk ke akunmu' }),
        el('p', { className: 'auth-card__subtitle', text: 'Belanja lokal lebih cepat & aman.' }),
      ]),

      el('form', {
        className: 'auth-form',
        listeners: { submit: handleSubmit },
      }, [
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Email', attrs: { for: 'email' } }),
          el('input', {
            className: 'input',
            attrs: { id: 'email', type: 'email', name: 'email', placeholder: 'nama@email.com', autocomplete: 'email', required: '' },
          }),
        ]),
        el('div', { className: 'field' }, [
          el('label', { className: 'field-label', text: 'Password', attrs: { for: 'password' } }),
          el('input', {
            className: 'input',
            attrs: { id: 'password', type: 'password', name: 'password', placeholder: '••••••', autocomplete: 'current-password', required: '' },
          }),
        ]),
        el('button', { className: 'btn btn-primary btn-block btn-lg', attrs: { type: 'submit' }, text: 'Masuk' }),
      ]),

      el('div', { className: 'auth-divider' }, [el('span', { text: 'atau' })]),

      el('button', {
        className: 'btn btn-secondary btn-block',
        html: '🇬 Masuk dengan Google',
        onClick: handleGoogle,
      }),

      el('div', { className: 'auth-card__footer' }, [
        el('p', { className: 'text-sm text-muted', text: 'Lupa password?' }),
        el('button', { className: 'btn-link', text: 'Reset password', onClick: handleResetPassword }),
      ]),

      el('div', { className: 'auth-card__footer' }, [
        el('span', { className: 'text-sm text-muted', text: 'Belum punya akun?' }),
        el('a', { className: 'btn-link', href: '#/register', text: 'Daftar gratis' }),
      ]),
    ])
  );

  return page;

  // ----- Handlers -----
  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!isValidEmail(email)) return toast.error('Email tidak valid.');
    if (password.length < 6) return toast.error('Password minimal 6 karakter.');

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      const { profile } = await loginWithEmail(email, password);
      toast.success('Berhasil masuk. Selamat datang!');
      const dest = resolveRoleRoute(profile?.role, redirect);
      navigate(dest);
    } catch (err) {
      console.error('[login] error:', err);
      toast.error(humanizeAuthError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  }

  async function handleGoogle() {
    try {
      const { profile } = await loginWithGoogle();
      toast.success('Berhasil masuk dengan Google.');
      const dest = resolveRoleRoute(profile?.role, '/');
      navigate(dest);
    } catch (err) {
      console.error('[login] google error:', err);
      toast.error('Gagal masuk dengan Google. Coba lagi.');
    }
  }

  async function handleResetPassword() {
    const email = page.querySelector('#email').value.trim();
    if (!isValidEmail(email)) return toast.warning('Isi email dulu untuk reset password.');
    try {
      await resetPassword(email);
      toast.success('Link reset password sudah dikirim ke emailmu.');
    } catch (err) {
      console.error('[login] reset error:', err);
      toast.error('Gagal mengirim email reset. Coba lagi.');
    }
  }
}

// ----- Helpers -----
function resolveRoleRoute(role, redirect) {
  if (redirect && redirect !== '/login' && redirect !== '/register') return redirect;
  switch (role) {
    case ROLE.SELLER: return '/seller';
    case ROLE.COURIER: return '/courier';
    case ROLE.ADMIN:
    case ROLE.SUPER_ADMIN: return '/admin';
    default: return '/';
  }
}

function humanizeAuthError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Email atau password salah.';
  if (code.includes('user-not-found')) return 'Email belum terdaftar.';
  if (code.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba beberapa saat lagi.';
  if (code.includes('popup-closed')) return 'Login Google dibatalkan.';
  if (code.includes('network-request-failed')) return 'Koneksi internet bermasalah.';
  return 'Terjadi masalah saat masuk. Coba lagi.';
}
