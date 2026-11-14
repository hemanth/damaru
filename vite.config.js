import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 700,
    sourcemap: false
  },
  server: {
    host: true,
    port: 5173
  }
});
