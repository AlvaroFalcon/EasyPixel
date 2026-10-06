import { defineConfig } from '@playwright/test';

/** Integration tests against the built Electron app (run `npm run build` first). */
export default defineConfig({
  testDir: 'e2e-electron',
  timeout: 90_000,
  workers: 1,
});
