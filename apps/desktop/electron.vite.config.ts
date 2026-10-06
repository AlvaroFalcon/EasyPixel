import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      // @easypixel/core ships TypeScript sources, so it must be bundled, not required at runtime.
      externalizeDeps: { exclude: ['@easypixel/core'] },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // stdio bridge for Claude Desktop (run with ELECTRON_RUN_AS_NODE=1)
          'mcp-bridge': resolve(__dirname, 'src/bridge/index.ts'),
        },
      },
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
