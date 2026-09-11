import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: dist/ funciona servido de qualquer pasta, sem internet.
  base: './',
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
