import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      // @easypixel/core ships TypeScript sources, so it must be bundled, not required at runtime.
      externalizeDeps: { exclude: ['@easypixel/core'] },
      // The stdio bridge for Claude Desktop is bundled separately (scripts/build-bridge.mjs).
    },
  },
  preload: {
    build: { externalizeDeps: { exclude: ['@easypixel/core'] } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});
