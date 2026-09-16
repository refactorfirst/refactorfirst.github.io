import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // The basePath leg is part of its own config (playwright.basepath.config.js)
  testIgnore: '**/basepath.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8003',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
  webServer: {
    // Build the static export, then serve out/ with GitHub Pages semantics
    // (see scripts/serve-out.py).
    command: 'bun run build && python3 scripts/serve-out.py',
    port: 8003,
    timeout: 300 * 1000,
  },
});