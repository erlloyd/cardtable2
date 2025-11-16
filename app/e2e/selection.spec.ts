/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ESLint suppressions above are necessary for Playwright E2E tests.
 *
 * Playwright's page.evaluate() runs code in the browser context where:
 * 1. We must access globalThis (typed as any) to reach test-only globals like __TEST_STORE__
 * 2. document.querySelector returns generic Element types that need unsafe access
 * 3. We cannot import type definitions into the browser sandbox
 *
 * These suppressions are standard practice for Playwright tests and don't indicate
 * actual type safety issues - TypeScript compilation passes without errors.
 */

import { test, expect } from '@playwright/test';

// Define minimal interfaces for type safety in page.evaluate()
interface TestStore {
  getAllObjects: () => Map<string, TableObject>;
}

interface TableObject {
  _pos: { x: number; y: number; r: number };
  _selectedBy: string | null;
}

/**
 * E2E Tests for Selection Ownership (M3-T3)
 *
 * Tests the complete selection flow:
 * - User clicks → selection appears
 * - Clear button → selections disappear
 * - Refresh → stale selections cleared
 */

test.describe('Selection Ownership E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to table page
    await page.goto('/table/selection-test');

    // Wait for store to be ready
    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });

    // CRITICAL: Wait for canvas/worker to be initialized!
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );

    // Wait for canvas element to be visible
    const canvas = page.getByTestId('board-canvas');
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // Give canvas time to render
    await page.waitForTimeout(200);
  });

  test('shows selection border when clicking an object', async ({ page }) => {
    // Reset to test scene to have objects
    await page.click('button:has-text("Reset to Test Scene")');

    // Wait for objects to be created in the store
    await expect(page.locator('text=Objects: 15')).toBeVisible({
      timeout: 5000,
    });

    // CRITICAL: Wait for objects to be rendered on the canvas
    // Store updates happen immediately, but rendering is async
    await page.waitForTimeout(500);

    // Get an object's screen position from the store
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;

      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      const objects = __TEST_STORE__.getAllObjects();

      // Get first object
      const firstEntry = Array.from(objects.entries())[0];
      if (!firstEntry) return null;

      const [, obj] = firstEntry;

      // Convert world coordinates to screen coordinates
      const screenX = obj._pos.x + canvasWidth / 2;
      const screenY = obj._pos.y + canvasHeight / 2;

      return { x: screenX, y: screenY };
    });

    if (!clickPos) {
      throw new Error('No objects found in store');
    }

    // Click on the object
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: clickPos.x, y: clickPos.y } });

    // Wait for selection to complete
    await page.waitForTimeout(200);

    // Verify object is selected in store
    const selectedCount = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      return Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      ).length;
    });

    expect(selectedCount).toBeGreaterThan(0);
  });

  test('clears selections when clicking "Clear Selections" button', async ({
    page,
  }) => {
    // Reset to test scene
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();
    await page.waitForTimeout(500); // Wait for rendering

    // Get an object's screen position and select it
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;

      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      const objects = __TEST_STORE__.getAllObjects();
      const firstEntry = Array.from(objects.entries())[0];
      if (!firstEntry) return null;

      const [, obj] = firstEntry;
      const screenX = obj._pos.x + canvasWidth / 2;
      const screenY = obj._pos.y + canvasHeight / 2;

      return { x: screenX, y: screenY };
    });

    if (!clickPos) {
      throw new Error('No objects found in store');
    }

    // Select the object
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: clickPos.x, y: clickPos.y } });
    await page.waitForTimeout(200);

    // Verify selection exists
    const selectedBefore = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      return Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      ).length;
    });

    expect(selectedBefore).toBeGreaterThan(0);

    // Click "Clear Selections" button
    await page.click('button:has-text("Clear Selections")');
    await page.waitForTimeout(200);

    // Verify selections cleared
    const selectedAfter = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      return Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      ).length;
    });

    expect(selectedAfter).toBe(0);
  });

  test('clears stale selections on page refresh', async ({ page }) => {
    // Setup: Create objects and select some
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();
    await page.waitForTimeout(500); // Wait for rendering

    // Get an object's screen position and select it
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;

      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      const objects = __TEST_STORE__.getAllObjects();
      const firstEntry = Array.from(objects.entries())[0];
      if (!firstEntry) return null;

      const [, obj] = firstEntry;
      const screenX = obj._pos.x + canvasWidth / 2;
      const screenY = obj._pos.y + canvasHeight / 2;

      return { x: screenX, y: screenY };
    });

    if (!clickPos) {
      throw new Error('No objects found in store');
    }

    // Select the object
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: clickPos.x, y: clickPos.y } });
    await page.waitForTimeout(200);

    // Verify object has _selectedBy
    const beforeRefresh = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      const selectedObjects = Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      );
      return selectedObjects.length;
    });

    expect(beforeRefresh).toBeGreaterThan(0);

    // Refresh page
    await page.reload();

    // Wait for store to be ready again
    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });

    // Verify stale selections were cleared
    const afterRefresh = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      const selectedObjects = Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      );
      return selectedObjects.length;
    });

    expect(afterRefresh).toBe(0);

    // Verify objects still exist (just selection cleared)
    await expect(page.locator('text=Objects: 15')).toBeVisible();
  });

  test('persists objects but not selections across refresh', async ({
    page,
  }) => {
    // Create test scene
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();

    // Get object count before refresh
    const countBefore = await page
      .locator('text=/Objects: \\d+/')
      .textContent();

    // Wait for IndexedDB to persist (persistence is async)
    await page.waitForTimeout(1000);

    // Refresh
    await page.reload();
    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });

    // Object count should be the same
    const countAfter = await page.locator('text=/Objects: \\d+/').textContent();
    expect(countAfter).toBe(countBefore);

    // But selections should be cleared (tested via console)
    const selectedCount = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      return Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      ).length;
    });

    expect(selectedCount).toBe(0);
  });

  test('allows selecting and unselecting multiple times', async ({ page }) => {
    // Reset to test scene
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();
    await page.waitForTimeout(500); // Wait for rendering

    // Get two different objects' screen positions
    const positions = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;

      const canvas = document.querySelector('canvas');
      if (!canvas) return [];

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      const objects = __TEST_STORE__.getAllObjects();
      const entries = Array.from(objects.entries()).slice(0, 2);

      return entries.map(([, obj]) => ({
        x: obj._pos.x + canvasWidth / 2,
        y: obj._pos.y + canvasHeight / 2,
      }));
    });

    if (positions.length < 2) {
      throw new Error('Need at least 2 objects for this test');
    }

    const canvas = page.locator('canvas');

    // Select object 1
    await canvas.click({ position: positions[0] });
    await page.waitForTimeout(100);

    // Select object 2
    await canvas.click({ position: positions[1] });
    await page.waitForTimeout(100);

    // Clear all
    await page.click('button:has-text("Clear Selections")');
    await page.waitForTimeout(100);

    // Select again
    await canvas.click({ position: positions[0] });
    await page.waitForTimeout(100);

    // Verify we can still select after clearing
    const selectedCount = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      return Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      ).length;
    });

    expect(selectedCount).toBeGreaterThan(0);
  });
});
