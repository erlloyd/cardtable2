import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  // No retries needed - tests are now 100% reliable with waitForRenderer()
  retries: 0,
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
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_E2E: 'true', // Disable antialias during E2E tests
    },
  },
});
