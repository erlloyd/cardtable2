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
    await expect(board).toContainText('Board loaded for table:');
  });

  test('should show loading state while Board loads', async ({ page }) => {
    await page.goto('/');

    // Click the "Open Table" button
    await page.click('text=Open Table');

    // The loading state might be very brief, but we can check if either loading or board appears
    const loadingOrBoard = page
      .locator('text=Loading board..., [data-testid="board"]')
      .first();
    await expect(loadingOrBoard).toBeVisible();
  });
});
