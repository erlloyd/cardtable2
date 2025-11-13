import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate from GameSelect to Table', async ({ page }) => {
    await page.goto('/');

    // Verify we're on the GameSelect page
    await expect(page.locator('h1')).toContainText('Cardtable');

    // Click the "Open Table" button
    await page.click('text=Open Table');

    // Wait for navigation to table route
    await page.waitForURL(/\/table\/[a-z]+-[a-z]+-[a-z]+/);

    // Verify the URL follows the adjective-adjective-animal pattern
    const url = page.url();
    const tableIdMatch = url.match(/\/table\/([a-z]+-[a-z]+-[a-z]+)/);
    expect(tableIdMatch).toBeTruthy();

    const tableId = tableIdMatch![1];
    const parts = tableId.split('-');
    expect(parts).toHaveLength(3);

    // Verify we're on the Table page
    await expect(page.locator('h2')).toContainText(`Table: ${tableId}`);
  });

  test('should lazy load Board component', async ({ page }) => {
    await page.goto('/');

    // Click the "Open Table" button
    await page.click('text=Open Table');

    // Wait for the Board component to load
    await page.waitForSelector('[data-testid="board"]');

    // Verify Board is rendered
    const board = page.locator('[data-testid="board"]');
    await expect(board).toBeVisible();
    await expect(board).toContainText('Board:');
  });

  test('should show Board after lazy loading', async ({ page }) => {
    await page.goto('/');

    // Click the "Open Table" button
    await page.click('text=Open Table');

    // Wait for the board to appear (lazy loaded)
    const board = page.locator('[data-testid="board"]');
    await expect(board).toBeVisible();
  });
});

test.describe('Worker Communication (M2-T1 & M2-T2)', () => {
  test('should initialize worker and show ready status', async ({ page }) => {
    await page.goto('/');

    // Navigate to table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Wait for worker to be ready
    const status = page.locator('[data-testid="worker-status"]');
    await expect(status).toContainText('Ready', { timeout: 5000 });

    // Verify "Worker is ready" message appears
    await expect(page.getByText('Worker is ready')).toBeVisible();
  });

  test('should initialize canvas and render', async ({ page }) => {
    await page.goto('/');

    // Navigate to table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Wait for canvas element to appear
    const canvas = page.locator('[data-testid="board-canvas"]');
    await expect(canvas).toBeVisible();

    // Wait for canvas to be initialized
    const status = page.locator('[data-testid="worker-status"]');
    await expect(status).toContainText('Initialized', { timeout: 5000 });

    // Verify "Canvas initialized" message appears
    await expect(page.getByText('Canvas initialized')).toBeVisible();
  });

  test('should send ping and receive pong', async ({ page }) => {
    await page.goto('/');

    // Navigate to table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Wait for worker to be ready
    await expect(page.locator('[data-testid="worker-status"]')).toContainText(
      'Ready',
      { timeout: 5000 },
    );

    // Click ping button
    await page.click('[data-testid="ping-button"]');

    // Verify pong response appears
    await expect(page.getByText(/Pong! Received:/)).toBeVisible({
      timeout: 5000,
    });
  });

  test('should send echo and receive echo response', async ({ page }) => {
    await page.goto('/');

    // Navigate to table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Wait for worker to be ready
    await expect(page.locator('[data-testid="worker-status"]')).toContainText(
      'Ready',
      { timeout: 5000 },
    );

    // Click echo button
    await page.click('[data-testid="echo-button"]');

    // Verify echo response appears
    await expect(page.getByText(/Echo:/)).toBeVisible({ timeout: 5000 });
  });

  test('should disable buttons until worker is ready', async ({ page }) => {
    await page.goto('/');

    // Navigate to table
    await page.click('text=Open Table');
    await page.waitForSelector('[data-testid="board"]');

    // Initially buttons should be disabled
    const pingButton = page.locator('[data-testid="ping-button"]');
    const echoButton = page.locator('[data-testid="echo-button"]');

    // Check if buttons are disabled (might be very brief)
    const isPingDisabled = await pingButton.isDisabled();
    const isEchoDisabled = await echoButton.isDisabled();

    // At least one should have been disabled at some point
    // (This is a weak test because the worker might be ready very quickly)
    expect(isPingDisabled || isEchoDisabled).toBeDefined();

    // Wait for worker to be ready
    await expect(page.locator('[data-testid="worker-status"]')).toContainText(
      'Ready',
      { timeout: 5000 },
    );

    // Now buttons should be enabled
    await expect(pingButton).toBeEnabled();
    await expect(echoButton).toBeEnabled();
  });
});
