import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Runs the renderer alone in a browser (no Electron): handy for UI work and browser tests. */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true },
});
