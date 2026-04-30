import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  // Tests use deterministic callbacks (waitForRenderer, waitForSelectionSettled)
  // but CI runners can occasionally drop keyboard events under load.
  // Retry once on CI to handle this; locally tests are 100% reliable.
  retries: process.env.CI ? 1 : 0,
  // Playwright workers are I/O-bound (browser automation), not CPU-bound
  // Can run more workers than CPUs for better parallelization
  // CI: 2 workers on GitHub Actions (2 core runner) - conservative for stability
  // Local: Unlimited (auto-detect based on available cores)
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start both the vite dev server (port 3000) and the y-websocket server
  // (port 3001) so multi-context tests like e2e/multiplayer-join.spec.ts can
  // synchronize across browser contexts. The Playwright cwd is `app/`, but
  // pnpm `--filter` resolves workspaces from the monorepo root regardless.
  webServer: [
    {
      command: 'pnpm --filter "@cardtable2/app" run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_E2E: 'true', // Disable antialias during E2E tests
      },
    },
    {
      command: 'pnpm --filter "@cardtable2/server" run dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
