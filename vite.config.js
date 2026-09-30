import { defineConfig, loadEnv } from 'vite';

// ============================================
// TokOnline.com — Vite Configuration
// Vanilla JS + Firebase, mobile-first, modular.
// Tidak ada framework besar (React/Vue/dll).
// ============================================

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    root: '.',
    publicDir: 'public',
    base: './',
    build: {
      outDir: 'dist',
      target: 'es2020',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
      strictPort: false,
    },
    define: {
      // Expose VITE_ env vars to client (sudah otomatis via import.meta.env,
      // tapi kita eksplisit di sini untuk dokumentasi).
      __APP_VERSION__: JSON.stringify(env.VITE_APP_NAME || 'TokOnline'),
    },
  };
});
