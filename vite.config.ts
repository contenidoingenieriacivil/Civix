import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version;

export default defineConfig({
  plugins: [react()],
  define: { __VERSION__: JSON.stringify(version) },
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 2500 },
  server: { port: 5173 },
  test: { include: ['pruebas/**/*.test.ts'], exclude: ['pruebas/e2e/**', 'node_modules/**'] },
});
