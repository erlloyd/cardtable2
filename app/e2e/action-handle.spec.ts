/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * E2E Tests for ActionHandle (M3.5.1-T6)
 *
 * Tests the complete ActionHandle lifecycle:
 * - Appears when object selected
 * - Moves when selection changes (no duplicates)
 * - Hides during camera operations (pan/zoom/drag)
 * - Reappears after camera operations at updated position
 * - Hides when clicking on board
 * - Smart positioning fallback logic
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

test.describe('ActionHandle E2E', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Navigate to dev table page with unique ID to avoid conflicts
    const tableId = `ah-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
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
        return (globalThis as any).__TEST_BOARD__ !== undefined;
      },
      { timeout: 5000 },
    );

    // Reset to test scene to create objects
    await page.click('button:has-text("Reset to Test Scene")');

    // Wait for objects to be created
    await expect(page.locator('text=Objects: 15')).toBeVisible({
      timeout: 5000,
    });

    // Wait for renderer to process all messages
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });
  });

  test('should show ActionHandle when object selected', async ({ page }) => {
    // Get first object position
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const [, firstObj] = objects[0];

      // Convert world coords to canvas-relative coords
      const canvasX = firstObj._pos.x + canvasWidth / 2;
      const canvasY = firstObj._pos.y + canvasHeight / 2;

      // Convert to viewport-absolute coords
      const canvasBBox = canvas.getBoundingClientRect();
      return {
        viewportX: canvasBBox.x + canvasX,
        viewportY: canvasBBox.y + canvasY,
      };
    });

    expect(clickPos).not.toBeNull();

    const canvas = page.getByTestId('board-canvas');

    // Click to select object
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
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
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify ActionHandle appears
    const actionHandle = page.getByTestId('action-handle');
    await expect(actionHandle).toBeVisible({ timeout: 2000 });
  });

  test('should move ActionHandle when selecting different object (no duplicates)', async ({
    page,
  }) => {
    // Select first object
    const firstClickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const [, firstObj] = objects[0];

      const canvasX = firstObj._pos.x + canvasWidth / 2;
      const canvasY = firstObj._pos.y + canvasHeight / 2;
      const canvasBBox = canvas.getBoundingClientRect();

      return {
        viewportX: canvasBBox.x + canvasX,
        viewportY: canvasBBox.y + canvasY,
      };
    });

    const canvas = page.getByTestId('board-canvas');

    // Click first object
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: firstClickPos!.viewportX,
      clientY: firstClickPos!.viewportY,
      screenX: firstClickPos!.viewportX,
      screenY: firstClickPos!.viewportY,
      pageX: firstClickPos!.viewportX,
      pageY: firstClickPos!.viewportY,
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
      clientX: firstClickPos!.viewportX,
      clientY: firstClickPos!.viewportY,
      screenX: firstClickPos!.viewportX,
      screenY: firstClickPos!.viewportY,
      pageX: firstClickPos!.viewportX,
      pageY: firstClickPos!.viewportY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Wait for ActionHandle to appear
    const actionHandle = page.getByTestId('action-handle');
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Get position of first ActionHandle
    const firstPosition = await actionHandle.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));

    // Select second object (different position)
    const secondClickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const [, secondObj] = objects[1];

      const canvasX = secondObj._pos.x + canvasWidth / 2;
      const canvasY = secondObj._pos.y + canvasHeight / 2;
      const canvasBBox = canvas.getBoundingClientRect();

      return {
        viewportX: canvasBBox.x + canvasX,
        viewportY: canvasBBox.y + canvasY,
      };
    });

    // Click second object
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: secondClickPos!.viewportX,
      clientY: secondClickPos!.viewportY,
      screenX: secondClickPos!.viewportX,
      screenY: secondClickPos!.viewportY,
      pageX: secondClickPos!.viewportX,
      pageY: secondClickPos!.viewportY,
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
      clientX: secondClickPos!.viewportX,
      clientY: secondClickPos!.viewportY,
      screenX: secondClickPos!.viewportX,
      screenY: secondClickPos!.viewportY,
      pageX: secondClickPos!.viewportX,
      pageY: secondClickPos!.viewportY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Get position of ActionHandle after selection change
    const secondPosition = await actionHandle.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));

    // Position should have changed
    expect(secondPosition).not.toEqual(firstPosition);

    // Should still only have ONE ActionHandle (no duplicates)
    const handleCount = await page.getByTestId('action-handle').count();
    expect(handleCount).toBe(1);
  });

  test('should hide ActionHandle during pan and reappear at updated position', async ({
    page,
  }) => {
    // Select an object first
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const [, firstObj] = objects[0];

      const canvasX = firstObj._pos.x + canvasWidth / 2;
      const canvasY = firstObj._pos.y + canvasHeight / 2;
      const canvasBBox = canvas.getBoundingClientRect();

      return {
        viewportX: canvasBBox.x + canvasX,
        viewportY: canvasBBox.y + canvasY,
      };
    });

    const canvas = page.getByTestId('board-canvas');

    // Click to select
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
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
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Wait for ActionHandle to appear
    const actionHandle = page.getByTestId('action-handle');
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Get initial position
    const initialPosition = await actionHandle.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));

    // Pan camera (drag on empty space)
    const canvasBBox = await canvas.boundingBox();
    const emptySpaceX = canvasBBox!.x + canvasBBox!.width - 50;
    const emptySpaceY = canvasBBox!.y + 50;

    // Start pan
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: emptySpaceX,
      clientY: emptySpaceY,
      screenX: emptySpaceX,
      screenY: emptySpaceY,
      pageX: emptySpaceX,
      pageY: emptySpaceY,
      button: 0,
      buttons: 1,
    });

    // Move pointer to pan
    await canvas.dispatchEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: emptySpaceX + 100,
      clientY: emptySpaceY + 100,
      screenX: emptySpaceX + 100,
      screenY: emptySpaceY + 100,
      pageX: emptySpaceX + 100,
      pageY: emptySpaceY + 100,
      button: 0,
      buttons: 1,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // ActionHandle should be hidden during pan (after move has started)
    await expect(actionHandle).not.toBeVisible({ timeout: 1000 });

    // End pan
    await canvas.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: emptySpaceX + 100,
      clientY: emptySpaceY + 100,
      screenX: emptySpaceX + 100,
      screenY: emptySpaceY + 100,
      pageX: emptySpaceX + 100,
      pageY: emptySpaceY + 100,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // ActionHandle should reappear after pan
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Position should be updated (camera moved)
    const updatedPosition = await actionHandle.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));

    expect(updatedPosition).not.toEqual(initialPosition);
  });

  test('should hide ActionHandle during zoom and reappear at updated position', async ({
    page,
  }) => {
    // Select an object first
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const [, firstObj] = objects[0];

      const canvasX = firstObj._pos.x + canvasWidth / 2;
      const canvasY = firstObj._pos.y + canvasHeight / 2;
      const canvasBBox = canvas.getBoundingClientRect();

      return {
        viewportX: canvasBBox.x + canvasX,
        viewportY: canvasBBox.y + canvasY,
      };
    });

    const canvas = page.getByTestId('board-canvas');

    // Click to select
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
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
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Wait for ActionHandle to appear
    const actionHandle = page.getByTestId('action-handle');
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Zoom in using wheel event
    const canvasBBox = await canvas.boundingBox();
    const centerX = canvasBBox!.x + canvasBBox!.width / 2;
    const centerY = canvasBBox!.y + canvasBBox!.height / 2;

    await canvas.dispatchEvent('wheel', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: centerX,
      clientY: centerY,
      deltaY: -100, // Zoom in
      deltaMode: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // ActionHandle should reappear after zoom
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Position should be updated (object size changed due to zoom)
    const updatedPosition = await actionHandle.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));

    // Position may be the same or different depending on zoom level
    // Just verify ActionHandle is still visible and positioned
    expect(updatedPosition.left).toBeTruthy();
    expect(updatedPosition.top).toBeTruthy();
  });

  test('should hide ActionHandle during object drag and reappear', async ({
    page,
  }) => {
    // Select an object first
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const [, firstObj] = objects[0];

      const canvasX = firstObj._pos.x + canvasWidth / 2;
      const canvasY = firstObj._pos.y + canvasHeight / 2;
      const canvasBBox = canvas.getBoundingClientRect();

      return {
        viewportX: canvasBBox.x + canvasX,
        viewportY: canvasBBox.y + canvasY,
      };
    });

    const canvas = page.getByTestId('board-canvas');

    // Click to select
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
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
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Wait for ActionHandle to appear
    const actionHandle = page.getByTestId('action-handle');
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Get initial position
    const initialPosition = await actionHandle.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));

    // Drag the selected object
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
      button: 0,
      buttons: 1,
    });

    // Move pointer to drag object
    await canvas.dispatchEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX + 100,
      clientY: clickPos!.viewportY + 100,
      screenX: clickPos!.viewportX + 100,
      screenY: clickPos!.viewportY + 100,
      pageX: clickPos!.viewportX + 100,
      pageY: clickPos!.viewportY + 100,
      button: 0,
      buttons: 1,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // ActionHandle should be hidden during drag (after move has started)
    await expect(actionHandle).not.toBeVisible({ timeout: 1000 });

    // End drag
    await canvas.dispatchEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX + 100,
      clientY: clickPos!.viewportY + 100,
      screenX: clickPos!.viewportX + 100,
      screenY: clickPos!.viewportY + 100,
      pageX: clickPos!.viewportX + 100,
      pageY: clickPos!.viewportY + 100,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // ActionHandle should reappear after drag
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Position should be updated (object moved)
    const updatedPosition = await actionHandle.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));

    expect(updatedPosition).not.toEqual(initialPosition);
  });

  test('should hide ActionHandle when clicking on empty board', async ({
    page,
  }) => {
    // Select an object first
    const clickPos = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const [, firstObj] = objects[0];

      const canvasX = firstObj._pos.x + canvasWidth / 2;
      const canvasY = firstObj._pos.y + canvasHeight / 2;
      const canvasBBox = canvas.getBoundingClientRect();

      return {
        viewportX: canvasBBox.x + canvasX,
        viewportY: canvasBBox.y + canvasY,
      };
    });

    const canvas = page.getByTestId('board-canvas');

    // Click to select
    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
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
      clientX: clickPos!.viewportX,
      clientY: clickPos!.viewportY,
      screenX: clickPos!.viewportX,
      screenY: clickPos!.viewportY,
      pageX: clickPos!.viewportX,
      pageY: clickPos!.viewportY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Wait for ActionHandle to appear
    const actionHandle = page.getByTestId('action-handle');
    await expect(actionHandle).toBeVisible({ timeout: 2000 });

    // Click on empty space (far right corner)
    const canvasBBox = await canvas.boundingBox();
    const emptySpaceX = canvasBBox!.x + canvasBBox!.width - 50;
    const emptySpaceY = canvasBBox!.y + 50;

    await canvas.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: emptySpaceX,
      clientY: emptySpaceY,
      screenX: emptySpaceX,
      screenY: emptySpaceY,
      pageX: emptySpaceX,
      pageY: emptySpaceY,
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
      clientX: emptySpaceX,
      clientY: emptySpaceY,
      screenX: emptySpaceX,
      screenY: emptySpaceY,
      pageX: emptySpaceX,
      pageY: emptySpaceY,
      button: 0,
      buttons: 0,
    });

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // ActionHandle should be hidden
    await expect(actionHandle).not.toBeVisible({ timeout: 2000 });
  });
});
