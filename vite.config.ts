import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 2500 },
  server: { port: 5173 },
  test: { include: ['pruebas/**/*.test.ts'], exclude: ['pruebas/e2e/**', 'node_modules/**'] },
});
