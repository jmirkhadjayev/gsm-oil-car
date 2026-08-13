import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode pages` — GitHub Pages uchun demo build (.env.pages faylidan VITE_LOCAL=1 olinadi).
// Boshqa hollarda oddiy server rejimi.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? '/gsm-oil-car/' : '/',
  server: {
    port: 5173,
    // Ishlab chiqish rejimida API so'rovlari backendga uzatiladi
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,   // sql.js (WebAssembly) alohida chunk sifatida yuklanadi
  },
}));
