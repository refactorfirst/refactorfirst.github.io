import { defineConfig } from '@playwright/test';

// E2E matrix leg for deployments under a sub-path (GitHub Pages project
// sites): build with NEXT_PUBLIC_BASE_PATH set and serve the export under
// that prefix. Only chromium — this leg checks routing/basePath plumbing,
// not browser parity.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'basepath.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8004/preview',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command:
      'NEXT_PUBLIC_BASE_PATH=/preview bun run build && python3 scripts/serve-out.py out 8004 preview',
    port: 8004,
    timeout: 300 * 1000,
  },
});
