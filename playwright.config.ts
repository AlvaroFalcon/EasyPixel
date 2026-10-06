import { defineConfig } from '@playwright/test';

/** Browser tests of the renderer (served standalone by Vite, without Electron). */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1400, height: 900 },
    // The tests use the Spanish UI texts; the app picks the system language on first run.
    locale: 'es-ES',
  },
  webServer: {
    command: 'npm run dev:web',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
