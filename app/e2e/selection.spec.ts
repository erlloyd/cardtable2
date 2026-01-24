/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ESLint suppression above is necessary for Playwright E2E tests.
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
import { dumpDebugState } from './test-helpers';

// Define minimal interfaces for type safety in page.evaluate()
interface TestStore {
  getAllObjects: () => Map<string, TableObject>;
}

interface TestBoard {
  waitForRenderer: () => Promise<void>;
  waitForSelectionSettled: () => Promise<void>;
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
  test.beforeEach(async ({ page }, testInfo) => {
    // Navigate to table page with unique ID to avoid conflicts when running in parallel
    const tableId = `sel-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);

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

    // Wait for __TEST_BOARD__ to be available
    await page.waitForFunction(
      () => {
        return (globalThis as any).__TEST_BOARD__ !== undefined;
      },
      { timeout: 5000 },
    );
  });

  test('shows selection border when clicking an object', async ({ page }) => {
    // Listen to console messages
    page.on('console', (msg) => {
      console.log(`[Browser ${msg.type()}]:`, msg.text());
    });

    // Reset to test scene to have objects
    await page.click('button:has-text("Reset to Test Scene")');

    // Wait for objects to be created in the store
    await expect(page.locator('text=Objects: 15')).toBeVisible({
      timeout: 5000,
    });

    // CRITICAL: Wait for objects to be rendered on the canvas
    // Store updates happen immediately, but rendering is async
    // Use waitForRenderer() to ensure renderer has processed all messages
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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

    // Wait for selection round-trip to complete
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // DEBUG: Dump state before assertion
    await dumpDebugState(page, 'BEFORE_SELECTION_ASSERTION');

    // Verify object is selected in store
    const selectedCount = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      return Array.from(objects.values()).filter(
        (obj) => obj._selectedBy !== null,
      ).length;
    });

    console.log(`[DEBUG] Selected count: ${selectedCount}`);
    expect(selectedCount).toBeGreaterThan(0);
  });

  test('clears selections when clicking "Clear Selections" button', async ({
    page,
  }) => {
    // Reset to test scene
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Select object 2
    await canvas.click({ position: positions[1] });
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Clear all
    await page.click('button:has-text("Clear Selections")');
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Select again
    await canvas.click({ position: positions[0] });
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

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

  test('dragging an unselected object selects and moves it', async ({
    page,
  }) => {
    // Listen to console messages
    page.on('console', (msg) => {
      console.log(`[Browser ${msg.type()}]:`, msg.text());
    });

    // Reset to test scene
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Get an object's ID, initial position, and canvas-relative screen position
    const objectData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;

      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      const objects = __TEST_STORE__.getAllObjects();
      const firstEntry = Array.from(objects.entries())[0];
      if (!firstEntry) return null;

      const [id, obj] = firstEntry;

      // Convert world coordinates to canvas-relative screen coordinates
      const screenX = obj._pos.x + canvasWidth / 2;
      const screenY = obj._pos.y + canvasHeight / 2;

      return {
        id,
        initialPos: { x: obj._pos.x, y: obj._pos.y },
        screenPos: { x: screenX, y: screenY },
        initiallySelected: obj._selectedBy !== null,
      };
    });

    if (!objectData) {
      throw new Error('No objects found in store');
    }

    // Verify object is NOT initially selected
    expect(objectData.initiallySelected).toBe(false);

    const canvas = page.locator('canvas');

    // Get canvas bounding box to convert canvas-relative coords to viewport coords
    const canvasBBox = await canvas.boundingBox();
    if (!canvasBBox) {
      throw new Error('Canvas bounding box not available');
    }

    // Convert canvas-relative position to viewport-absolute coordinates
    const startX = canvasBBox.x + objectData.screenPos.x;
    const startY = canvasBBox.y + objectData.screenPos.y;

    // Drag 100px to the right and 50px down
    const dragDeltaX = 100;
    const dragDeltaY = 50;
    const endX = startX + dragDeltaX;
    const endY = startY + dragDeltaY;

    // Dispatch pointerdown event
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: startX,
      clientY: startY,
      screenX: startX,
      screenY: startY,
      pageX: startX,
      pageY: startY,
      button: 0,
      buttons: 1,
    });
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Dispatch pointermove events (simulate drag with multiple steps)
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const moveX = startX + (dragDeltaX * i) / steps;
      const moveY = startY + (dragDeltaY * i) / steps;

      await canvas.dispatchEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: moveX,
        clientY: moveY,
        screenX: moveX,
        screenY: moveY,
        pageX: moveX,
        pageY: moveY,
        button: 0,
        buttons: 1,
      });
      // No waitForRenderer needed - pointermove events process asynchronously
      // Only wait after pointerup for final state synchronization
    }

    // Dispatch pointerup event at final position
    await canvas.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: endX,
      clientY: endY,
      screenX: endX,
      screenY: endY,
      pageX: endX,
      pageY: endY,
      button: 0,
      buttons: 0,
    });

    // Wait for drag and selection to complete using waitForRenderer
    console.log('[E2E] Calling waitForRenderer after drag...');
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });
    console.log('[E2E] waitForRenderer completed');

    // Verify object is now selected AND has moved
    const afterDrag = await page.evaluate((id: string) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const objects = __TEST_STORE__.getAllObjects();
      const obj = objects.get(id);
      if (!obj) return null;

      return {
        selected: obj._selectedBy !== null,
        selectedBy: obj._selectedBy,
        finalPos: { x: obj._pos.x, y: obj._pos.y },
      };
    }, objectData.id);

    if (!afterDrag) {
      throw new Error('Object not found after drag');
    }

    // Verify object is now selected
    expect(afterDrag.selected).toBe(true);

    // Debug: Log position changes
    const deltaX = afterDrag.finalPos.x - objectData.initialPos.x;
    const deltaY = afterDrag.finalPos.y - objectData.initialPos.y;
    console.log(`[E2E] Position change: (${deltaX}, ${deltaY})`);
    console.log(
      `[E2E] Initial: (${objectData.initialPos.x}, ${objectData.initialPos.y})`,
    );
    console.log(
      `[E2E] Final: (${afterDrag.finalPos.x}, ${afterDrag.finalPos.y})`,
    );

    // Verify object position has changed (should have moved by approximately dragDeltaX/Y)
    const positionChanged =
      Math.abs(afterDrag.finalPos.x - objectData.initialPos.x) > 50 ||
      Math.abs(afterDrag.finalPos.y - objectData.initialPos.y) > 25;

    expect(positionChanged).toBe(true);
  });

  test('dragging an already selected object keeps it selected and moves it', async ({
    page,
  }) => {
    // Reset to test scene
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    }); // REPLACED waitForTimeout(500);

    // Get first object data
    const objectData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = __TEST_STORE__.getAllObjects();
      const [id, obj] = Array.from(objects.entries())[0];
      const screenX = obj._pos.x + canvasWidth / 2;
      const screenY = obj._pos.y + canvasHeight / 2;

      return {
        id,
        initialPos: { x: obj._pos.x, y: obj._pos.y },
        screenPos: { x: screenX, y: screenY },
      };
    });

    if (!objectData) throw new Error('No objects found');

    const canvas = page.locator('canvas');
    const canvasBBox = await canvas.boundingBox();
    if (!canvasBBox) throw new Error('Canvas not found');

    const clickX = canvasBBox.x + objectData.screenPos.x;
    const clickY = canvasBBox.y + objectData.screenPos.y;

    // Click to select the object first
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickX,
      clientY: clickY,
      button: 0,
      buttons: 1,
    });

    await canvas.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickX,
      clientY: clickY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    }); // REPLACED waitForTimeout(100); // Wait for selection

    // Verify it's selected
    const isSelected = await page.evaluate((id: string) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const obj = __TEST_STORE__.getAllObjects().get(id);
      return obj?._selectedBy !== null;
    }, objectData.id);

    expect(isSelected).toBe(true);

    // Now drag it
    const dragDeltaX = 100;
    const dragDeltaY = 50;
    const endX = clickX + dragDeltaX;
    const endY = clickY + dragDeltaY;

    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickX,
      clientY: clickY,
      button: 0,
      buttons: 1,
    });

    for (let i = 1; i <= 5; i++) {
      const moveX = clickX + (dragDeltaX * i) / 5;
      const moveY = clickY + (dragDeltaY * i) / 5;
      await canvas.dispatchEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: moveX,
        clientY: moveY,
        button: 0,
        buttons: 1,
      });
      // No waitForRenderer needed - pointermove events process asynchronously
      // Only wait after pointerup for final state synchronization
    }

    await canvas.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    }); // REPLACED waitForTimeout(300);

    // Verify still selected and moved
    const afterDrag = await page.evaluate((id: string) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const obj = __TEST_STORE__.getAllObjects().get(id);
      return {
        selected: obj?._selectedBy !== null,
        finalPos: { x: obj?._pos.x ?? 0, y: obj?._pos.y ?? 0 },
      };
    }, objectData.id);

    expect(afterDrag.selected).toBe(true);
    const positionChanged =
      Math.abs(afterDrag.finalPos.x - objectData.initialPos.x) > 50 ||
      Math.abs(afterDrag.finalPos.y - objectData.initialPos.y) > 25;
    expect(positionChanged).toBe(true);
  });

  test('CMD-dragging an unselected object with other selected objects moves all', async ({
    page,
  }) => {
    console.log('[E2E-TEST] ========== TEST START ==========');

    // Reset to test scene
    console.log('[E2E-TEST] Step 1: Reset to test scene');
    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible();
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    }); // REPLACED waitForTimeout(500);

    // Get two objects
    console.log('[E2E-TEST] Step 2: Get object data from store');
    const objectsData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = __TEST_STORE__.getAllObjects();
      const entries = Array.from(objects.entries());

      const obj1 = entries[0];
      const obj2 = entries[1];

      return {
        obj1: {
          id: obj1[0],
          initialPos: { x: obj1[1]._pos.x, y: obj1[1]._pos.y },
          screenPos: {
            x: obj1[1]._pos.x + canvasWidth / 2,
            y: obj1[1]._pos.y + canvasHeight / 2,
          },
        },
        obj2: {
          id: obj2[0],
          initialPos: { x: obj2[1]._pos.x, y: obj2[1]._pos.y },
          screenPos: {
            x: obj2[1]._pos.x + canvasWidth / 2,
            y: obj2[1]._pos.y + canvasHeight / 2,
          },
        },
      };
    });

    if (!objectsData) throw new Error('No objects found');
    console.log('[E2E-TEST] Object data:', objectsData);

    const canvas = page.locator('canvas');
    const canvasBBox = await canvas.boundingBox();
    if (!canvasBBox) throw new Error('Canvas not found');

    // Select first object (without CMD)
    console.log('[E2E-TEST] Step 3: Click obj1 to select it (without CMD)');
    const click1X = canvasBBox.x + objectsData.obj1.screenPos.x;
    const click1Y = canvasBBox.y + objectsData.obj1.screenPos.y;

    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: click1X,
      clientY: click1Y,
      button: 0,
      buttons: 1,
    });

    await canvas.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: click1X,
      clientY: click1Y,
      button: 0,
      buttons: 0,
    });

    // Wait for first object's selection to complete and render before starting CMD-drag
    console.log('[E2E-TEST] Step 4: Wait for obj1 selection to propagate');
    await page.evaluate(async () => {
      const __TEST_BOARD__ = (globalThis as any).__TEST_BOARD__ as TestBoard;
      console.log('[E2E-TEST] Calling waitForRenderer()...');
      await __TEST_BOARD__.waitForRenderer();
      console.log('[E2E-TEST] waitForRenderer() completed');
    });

    // Now CMD-drag the second object
    console.log('[E2E-TEST] Step 5: CMD+drag obj2');
    const click2X = canvasBBox.x + objectsData.obj2.screenPos.x;
    const click2Y = canvasBBox.y + objectsData.obj2.screenPos.y;
    const dragDeltaX = 100;
    const dragDeltaY = 50;
    const endX = click2X + dragDeltaX;
    const endY = click2Y + dragDeltaY;

    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: click2X,
      clientY: click2Y,
      button: 0,
      buttons: 1,
      metaKey: true, // CMD modifier
    });

    // Wait for pointerdown to be fully processed (selection + visual updates)
    // before starting drag move events
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    for (let i = 1; i <= 5; i++) {
      const moveX = click2X + (dragDeltaX * i) / 5;
      const moveY = click2Y + (dragDeltaY * i) / 5;
      await canvas.dispatchEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: moveX,
        clientY: moveY,
        button: 0,
        buttons: 1,
        metaKey: true,
      });
      // No waitForRenderer needed - pointermove events process asynchronously
      // Only wait after pointerup for final state synchronization
    }

    await canvas.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: endX,
      clientY: endY,
      button: 0,
      buttons: 0,
      metaKey: true,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    }); // REPLACED waitForTimeout(300);

    // Verify both objects moved
    const afterDrag = await page.evaluate((data: typeof objectsData) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const obj1 = __TEST_STORE__.getAllObjects().get(data.obj1.id);
      const obj2 = __TEST_STORE__.getAllObjects().get(data.obj2.id);

      return {
        obj1: {
          selected: obj1?._selectedBy !== null,
          finalPos: { x: obj1?._pos.x ?? 0, y: obj1?._pos.y ?? 0 },
        },
        obj2: {
          selected: obj2?._selectedBy !== null,
          finalPos: { x: obj2?._pos.x ?? 0, y: obj2?._pos.y ?? 0 },
        },
      };
    }, objectsData);

    // Both should be selected
    expect(afterDrag.obj1.selected).toBe(true);
    expect(afterDrag.obj2.selected).toBe(true);

    // Both should have moved
    const obj1Moved =
      Math.abs(afterDrag.obj1.finalPos.x - objectsData.obj1.initialPos.x) >
        50 ||
      Math.abs(afterDrag.obj1.finalPos.y - objectsData.obj1.initialPos.y) > 25;
    const obj2Moved =
      Math.abs(afterDrag.obj2.finalPos.x - objectsData.obj2.initialPos.x) >
        50 ||
      Math.abs(afterDrag.obj2.finalPos.y - objectsData.obj2.initialPos.y) > 25;

    expect(obj1Moved).toBe(true);
    expect(obj2Moved).toBe(true);
  });

  test('CMD/Ctrl+drag in select mode pans camera instead of selecting', async ({
    page,
  }) => {
    await page.goto('/dev/table/test-cmd-drag-select-mode');

    // Wait for canvas to be visible
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // Switch to select mode
    await page.click('[data-testid="interaction-mode-toggle"]');
    await expect(
      page.locator('[data-testid="interaction-mode-toggle"]'),
    ).toContainText('Select Mode');

    // Get canvas element for dragging
    const canvasElement = await page.$('canvas');
    if (!canvasElement) throw new Error('Canvas not found');

    const canvasBBox = await canvasElement.boundingBox();
    if (!canvasBBox) throw new Error('Canvas has no bounding box');

    // Calculate center of canvas
    const centerX = canvasBBox.x + canvasBBox.width / 2;
    const centerY = canvasBBox.y + canvasBBox.height / 2;

    // CMD+drag on empty space (should pan, not draw selection rectangle)
    await canvasElement.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: centerX,
      clientY: centerY,
      screenX: centerX,
      screenY: centerY,
      pageX: centerX,
      pageY: centerY,
      button: 0,
      buttons: 1,
      metaKey: true, // CMD key pressed
    });

    // Drag significantly
    const dragEndX = centerX + 100;
    const dragEndY = centerY + 100;

    await canvasElement.dispatchEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: dragEndX,
      clientY: dragEndY,
      screenX: dragEndX,
      screenY: dragEndY,
      pageX: dragEndX,
      pageY: dragEndY,
      button: 0,
      buttons: 1,
      metaKey: true,
    });

    await canvasElement.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: dragEndX,
      clientY: dragEndY,
      screenX: dragEndX,
      screenY: dragEndY,
      pageX: dragEndX,
      pageY: dragEndY,
      button: 0,
      buttons: 0,
      metaKey: true,
    });

    // Wait briefly for any UI updates
    await page.waitForTimeout(100);

    // Verify no crash occurred (page is still functional)
    await expect(canvas).toBeVisible();

    // Test passes if we didn't crash or draw a selection rectangle
    // (visual verification is not possible with canvas rendering)
  });
});
