import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Ishlab chiqish rejimida API so'rovlari backendga uzatiladi
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
