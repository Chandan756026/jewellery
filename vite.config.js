import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where Apache serves this project's PHP API + uploads (XAMPP default shown).
  const backend = env.BACKEND_URL || 'http://localhost/ckg/jewellery';
  const target = new URL(backend);
  const prefix = target.pathname.replace(/\/$/, '');
  const proxy = Object.fromEntries(
    ['/api', '/uploads'].map((p) => [
      p,
      { target: target.origin, changeOrigin: true, rewrite: (path) => prefix + path },
    ])
  );
  return { plugins: [react()], server: { proxy }, preview: { proxy } };
});
