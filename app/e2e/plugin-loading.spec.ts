/**
 * E2E Tests for Plugin-Based Scenario Loading
 *
 * Tests the plugin loading UI and action availability.
 * Full integration testing of plugin loading is covered by unit tests.
 */

import { test, expect } from '@playwright/test';

test.describe('Plugin Loading E2E', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Navigate to dev table page with unique ID to avoid conflicts
    const tableId = `plugin-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);

    // Wait for store to be ready
    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });

    // Wait for canvas/worker to be initialized
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );

    // Wait for canvas element to be visible
    const canvas = page.getByTestId('board-canvas');
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // Wait for __TEST_BOARD__ to be available
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (globalThis as any).__TEST_BOARD__ !== undefined;
      },
      { timeout: 5000 },
    );

    // Wait for renderer to process all messages
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });
  });

  test('should show Marvel Champions action in command palette', async ({
    page,
  }) => {
    // Open command palette
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

    // Wait for command palette to be visible
    const paletteInput = page.locator('input[placeholder*="Search"]').first();
    await expect(paletteInput).toBeVisible({ timeout: 2000 });

    // Search for Marvel Champions action
    await page.keyboard.type('marvel champions');

    // Verify action appears in results
    const actionItem = page
      .locator('.command-palette-label')
      .filter({ hasText: /Load Marvel Champions.*Rhino/i });
    await expect(actionItem).toBeVisible({ timeout: 2000 });

    // Verify action has correct icon and text
    const actionText = await actionItem.textContent();
    expect(actionText).toContain('Marvel Champions');
    expect(actionText).toContain('Rhino');
  });

  test('should show Load Plugin from Directory action in command palette', async ({
    page,
  }) => {
    // Open command palette
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

    // Wait for command palette to be visible
    const paletteInput = page.locator('input[placeholder*="Search"]').first();
    await expect(paletteInput).toBeVisible({ timeout: 2000 });

    // Search for plugin directory action
    await page.keyboard.type('plugin directory');

    // Verify action appears in results
    const actionItem = page
      .locator('.command-palette-label')
      .filter({ hasText: /Load Plugin from Directory/i });
    await expect(actionItem).toBeVisible({ timeout: 2000 });

    // Verify action has correct text
    const actionText = await actionItem.textContent();
    expect(actionText).toContain('Load Plugin from Directory');
  });

  test('should show load scenario action in command palette', async ({
    page,
  }) => {
    // Open command palette
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

    // Wait for command palette to be visible
    const paletteInput = page.locator('input[placeholder*="Search"]').first();
    await expect(paletteInput).toBeVisible({ timeout: 2000 });

    // Search for load scenario action
    await page.keyboard.type('load scenario');

    // Verify action appears in results
    const actionItem = page
      .locator('.command-palette-label')
      .filter({ hasText: /Load Scenario/i });
    await expect(actionItem).toBeVisible({ timeout: 2000 });
  });

  test('should verify test scene loads successfully', async ({ page }) => {
    // This is a sanity check to ensure basic scenario loading works
    // Reset to Test Scene uses similar infrastructure to plugin loading

    // Verify table starts empty
    await expect(page.locator('text=Objects: 0')).toBeVisible({
      timeout: 2000,
    });

    // Click Reset to Test Scene button
    await page.click('button:has-text("Reset to Test Scene")');

    // Wait for objects to be created
    await expect(page.locator('text=Objects: 15')).toBeVisible({
      timeout: 5000,
    });

    // Verify objects were created successfully
    const objectCount = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (globalThis as any).__TEST_STORE__;
      return store.getAllObjects().size;
    });

    expect(objectCount).toBe(15);
  });
});
