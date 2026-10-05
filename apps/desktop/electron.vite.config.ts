import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    // @easypixel/core ships TypeScript sources, so it must be bundled, not required at runtime.
    build: { externalizeDeps: { exclude: ['@easypixel/core'] } },
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
