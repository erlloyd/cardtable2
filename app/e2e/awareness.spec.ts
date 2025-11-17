/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { test, expect } from '@playwright/test';
import type { YjsStore } from '../src/store/YjsStore';

/**
 * E2E tests for M3-T4 Awareness features
 * Tests remote cursor and drag ghost simulation
 *
 * NOTE: ESLint unsafe-* rules disabled for page.evaluate() calls
 * because Playwright executes in browser context where TypeScript
 * cannot properly type-check window access.
 */

// Type for window.__TEST_STORE__
declare global {
  interface Window {
    __TEST_STORE__?: YjsStore;
  }
}

test.describe('Awareness (M3-T4)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a table
    await page.goto('/table/awareness-test-table');

    // Wait for the store to be ready
    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible();

    // Reset to test scene to have objects to work with
    await page.locator('button:has-text("Reset to Test Scene")').click();

    // Wait for objects to be created
    await expect(page.locator('text=Objects: 15')).toBeVisible();
  });

  test('simulate cursor button shows remote cursor', async ({ page }) => {
    // Click simulate cursor button
    await page.locator('button:has-text("▶ Simulate Cursor")').click();

    // Button should change to stop state
    await expect(
      page.locator('button:has-text("⏸ Stop Cursor")'),
    ).toBeVisible();

    // Wait a moment for cursor to render
    await page.waitForTimeout(200);

    // Check awareness state in browser console
    const awarenessState = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      if (!store) return null;

      const remoteStates = store.getRemoteAwarenessStates();
      const firstState =
        remoteStates.size > 0 ? Array.from(remoteStates.values())[0] : null;
      return {
        hasRemoteStates: remoteStates.size > 0,
        firstState: firstState
          ? {
              actorId: firstState.actorId,
              cursor: firstState.cursor,
            }
          : null,
      };
    });

    expect(awarenessState?.hasRemoteStates).toBe(true);
    expect(awarenessState?.firstState).toBeDefined();
    expect(awarenessState?.firstState?.actorId).toBe('fake-actor-alice');
    expect(awarenessState?.firstState?.cursor).toBeDefined();

    // Stop simulation
    await page.locator('button:has-text("⏸ Stop Cursor")').click();
    await expect(
      page.locator('button:has-text("▶ Simulate Cursor")'),
    ).toBeVisible();
  });

  test('simulate drag button shows drag ghost', async ({ page }) => {
    // Click simulate drag button
    await page.locator('button:has-text("▶ Simulate Drag")').click();

    // Button should change to stop state
    await expect(page.locator('button:has-text("⏸ Stop Drag")')).toBeVisible();

    // Wait a moment for drag ghost to render
    await page.waitForTimeout(200);

    // Check awareness state
    const awarenessState = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      if (!store) return null;

      const remoteStates = store.getRemoteAwarenessStates();
      const firstState =
        remoteStates.size > 0 ? Array.from(remoteStates.values())[0] : null;
      return {
        hasRemoteStates: remoteStates.size > 0,
        firstState: firstState
          ? {
              actorId: firstState.actorId,
              drag: firstState.drag,
            }
          : null,
      };
    });

    expect(awarenessState?.hasRemoteStates).toBe(true);
    expect(awarenessState?.firstState).toBeDefined();
    expect(awarenessState?.firstState?.actorId).toBe('fake-actor-bob');
    expect(awarenessState?.firstState?.drag).toBeDefined();
    expect(awarenessState?.firstState?.drag?.ids).toBeDefined();
    expect(awarenessState?.firstState?.drag?.pos).toBeDefined();

    // Stop simulation
    await page.locator('button:has-text("⏸ Stop Drag")').click();
    await expect(
      page.locator('button:has-text("▶ Simulate Drag")'),
    ).toBeVisible();
  });

  test('stopping cursor simulation removes awareness state', async ({
    page,
  }) => {
    // Start simulation
    await page.locator('button:has-text("▶ Simulate Cursor")').click();
    await page.waitForTimeout(100);

    // Verify state exists
    let hasState = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      return store ? store.getRemoteAwarenessStates().size > 0 : false;
    });
    expect(hasState).toBe(true);

    // Stop simulation
    await page.locator('button:has-text("⏸ Stop Cursor")').click();
    await page.waitForTimeout(100);

    // Verify state is removed
    hasState = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      return store ? store.getRemoteAwarenessStates().size > 0 : false;
    });
    expect(hasState).toBe(false);
  });

  test('cursor simulation updates position over time', async ({ page }) => {
    // Start cursor simulation
    await page.locator('button:has-text("▶ Simulate Cursor")').click();

    // Get initial cursor position
    await page.waitForTimeout(100);
    const initialPos = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      if (!store) return null;
      const remoteStates = store.getRemoteAwarenessStates();
      const firstState =
        remoteStates.size > 0 ? Array.from(remoteStates.values())[0] : null;
      return firstState?.cursor || null;
    });

    // Wait for cursor to move
    await page.waitForTimeout(200);

    // Get updated cursor position
    const updatedPos = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      if (!store) return null;
      const remoteStates = store.getRemoteAwarenessStates();
      const firstState =
        remoteStates.size > 0 ? Array.from(remoteStates.values())[0] : null;
      return firstState?.cursor || null;
    });

    // Positions should be different (cursor is moving in a circle)
    expect(initialPos?.x).not.toBe(updatedPos?.x);
    expect(initialPos?.y).not.toBe(updatedPos?.y);

    // Stop simulation
    await page.locator('button:has-text("⏸ Stop Cursor")').click();
  });

  test('drag simulation updates position over time', async ({ page }) => {
    // Start drag simulation
    await page.locator('button:has-text("▶ Simulate Drag")').click();

    // Get initial drag position
    await page.waitForTimeout(100);
    const initialPos = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      if (!store) return null;
      const remoteStates = store.getRemoteAwarenessStates();
      const firstState =
        remoteStates.size > 0 ? Array.from(remoteStates.values())[0] : null;
      return firstState?.drag?.pos || null;
    });

    // Wait for drag to move
    await page.waitForTimeout(200);

    // Get updated drag position
    const updatedPos = await page.evaluate(() => {
      const store = window.__TEST_STORE__;
      if (!store) return null;
      const remoteStates = store.getRemoteAwarenessStates();
      const firstState =
        remoteStates.size > 0 ? Array.from(remoteStates.values())[0] : null;
      return firstState?.drag?.pos || null;
    });

    // Positions should be different (drag is moving in sine wave)
    expect(initialPos?.x).not.toBe(updatedPos?.x);

    // Stop simulation
    await page.locator('button:has-text("⏸ Stop Drag")').click();
  });

  test('cannot start drag simulation while cursor simulation is running', async ({
    page,
  }) => {
    // Start cursor simulation
    await page.locator('button:has-text("▶ Simulate Cursor")').click();

    // Drag button should be disabled
    const dragButton = page.locator('button:has-text("▶ Simulate Drag")');
    await expect(dragButton).toBeDisabled();

    // Stop cursor simulation
    await page.locator('button:has-text("⏸ Stop Cursor")').click();

    // Drag button should now be enabled
    await expect(dragButton).toBeEnabled();
  });
});
