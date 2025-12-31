/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * E2E Tests for Stack Operations
 *
 * ESLint suppression above is necessary for Playwright E2E tests.
 * We must access globalThis (typed as any) to reach test-only globals like __TEST_STORE__.
 *
 * Tests the complete stack/unstack workflow:
 * - Drag-and-drop stack merging
 * - Unstack handle interaction (extract top card)
 * - Persistence after page refresh
 *
 * Visual feedback tests (count badge, stack target border) are deferred.
 */

import { test, expect } from '@playwright/test';

// Define minimal interfaces for type safety in page.evaluate()
interface TestStore {
  getAllObjects: () => Map<string, TableObject>;
  getObjectYMap: (id: string) => any;
}

interface StackPosition {
  x: number;
  y: number;
}

interface TableObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _selectedBy: string | null;
  _cards?: string[];
  _faceUp?: boolean;
}

test.describe('Stack Operations E2E', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Navigate to dev table page with unique ID to avoid conflicts
    const tableId = `stack-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
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
    // Test scene creates 5 stacks with [1,2,3,5,1] cards at (-300+i*80, -200)
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

  test('should merge two stacks via drag-and-drop', async ({ page }) => {
    // Get positions of first two stacks from test scene
    // Stack 0: 1 card at (-300, -200)
    // Stack 1: 2 cards at (-220, -200)
    const stackData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const canvasBBox = canvas.getBoundingClientRect();

      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());

      // Find first two stacks
      const stacks = objects.filter(([, obj]) => obj._kind === 'stack');

      if (stacks.length < 2) return null;

      const [stack0Id, stack0] = stacks[0];
      const [stack1Id, stack1] = stacks[1];

      // Convert world coordinates to viewport coordinates
      const toViewport = (worldX: number, worldY: number) => ({
        x: canvasBBox.x + canvasWidth / 2 + worldX,
        y: canvasBBox.y + canvasHeight / 2 + worldY,
      });

      return {
        stack0Pos: toViewport(stack0._pos.x, stack0._pos.y),
        stack1Pos: toViewport(stack1._pos.x, stack1._pos.y),
        stack0Id: String(stack0Id),
        stack1Id: String(stack1Id),
      };
    });

    if (!stackData) {
      throw new Error('Failed to get stack positions');
    }

    const stack0Pos: StackPosition = stackData.stack0Pos;
    const stack1Pos: StackPosition = stackData.stack1Pos;
    const stack0Id: string = stackData.stack0Id;
    const stack1Id: string = stackData.stack1Id;

    // Select first stack (source)
    await page.mouse.click(stack0Pos.x, stack0Pos.y);

    // Wait for selection to settle
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForSelectionSettled();
    });

    // Drag first stack onto second stack (target)
    await page.mouse.move(stack0Pos.x, stack0Pos.y);
    await page.mouse.down();
    await page.mouse.move(stack1Pos.x, stack1Pos.y, { steps: 10 });
    await page.mouse.up();

    // Wait for renderer to process stack operation
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify: stack0 should be deleted, stack1 should have 3 cards (1+2)
    const result = await page.evaluate(
      (ids: { stack0Id: string; stack1Id: string }) => {
        const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
        const stack0Exists =
          __TEST_STORE__.getObjectYMap(ids.stack0Id) !== undefined;
        const stack1YMap = __TEST_STORE__.getObjectYMap(ids.stack1Id);
        const stack1Cards = stack1YMap ? stack1YMap.get('_cards') : null;

        return {
          stack0Exists,
          stack1CardCount: stack1Cards?.length ?? 0,
        };
      },
      { stack0Id, stack1Id },
    );

    expect(result.stack0Exists).toBe(false);
    expect(result.stack1CardCount).toBe(3); // 1 + 2 = 3
  });

  test('should extract top card via unstack handle', async ({ page }) => {
    // Get position of a multi-card stack from test scene
    // Stack 1 has 2 cards at (-220, -200)
    const stackData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const canvasBBox = canvas.getBoundingClientRect();

      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());

      // Find a stack with 2+ cards
      const multiCardStack = objects.find(
        ([, obj]) =>
          obj._kind === 'stack' && obj._cards && obj._cards.length >= 2,
      );

      if (!multiCardStack) return null;

      const [stackId, stack] = multiCardStack;

      // Convert world coordinates to viewport coordinates
      const viewportX = canvasBBox.x + canvasWidth / 2 + stack._pos.x;
      const viewportY = canvasBBox.y + canvasHeight / 2 + stack._pos.y;

      return {
        stackPos: { x: viewportX, y: viewportY },
        stackId: String(stackId),
        initialCardCount: stack._cards!.length,
      };
    });

    if (!stackData) {
      throw new Error('Failed to find multi-card stack');
    }

    const stackPos: StackPosition = stackData.stackPos;
    const stackId: string = stackData.stackId;
    const initialCardCount: number = stackData.initialCardCount;

    // Calculate unstack handle position (upper-right corner)
    // Stack width: 60, height: 84 (from constants)
    // Handle is at upper-right corner
    const handleOffsetX = 25; // Approximate offset from center to upper-right
    const handleOffsetY = -35; // Approximate offset from center to top
    const handleX: number = stackPos.x + handleOffsetX;
    const handleY: number = stackPos.y + handleOffsetY;

    // Drag unstack handle to extract top card
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    // Drag to the right
    await page.mouse.move(handleX + 100, handleY, { steps: 10 });
    await page.mouse.up();

    // Wait for renderer to process unstack operation
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify: source stack should have one less card, new stack should exist
    const result = await page.evaluate(
      (data: { stackId: string; initialCardCount: number }) => {
        const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
        const sourceStackYMap = __TEST_STORE__.getObjectYMap(data.stackId);
        const sourceCards = sourceStackYMap
          ? sourceStackYMap.get('_cards')
          : null;

        // Count total stacks to see if new one was created
        const allObjects = Array.from(__TEST_STORE__.getAllObjects().values());
        const stackCount = allObjects.filter(
          (obj: any) => obj._kind === 'stack',
        ).length;

        return {
          sourceCardCount: sourceCards?.length ?? 0,
          stackCount,
        };
      },
      { stackId, initialCardCount },
    );

    expect(result.sourceCardCount).toBe(initialCardCount - 1);
    expect(result.stackCount).toBeGreaterThan(5); // Original 5 + new unstacked card
  });

  test('should merge multiple selected stacks onto target', async ({
    page,
  }) => {
    // Get positions of first three stacks from test scene
    const stackData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const canvasBBox = canvas.getBoundingClientRect();

      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());

      // Find first three stacks
      const stacks = objects.filter(([, obj]) => obj._kind === 'stack');

      if (stacks.length < 3) return null;

      const toViewport = (worldX: number, worldY: number) => ({
        x: canvasBBox.x + canvasWidth / 2 + worldX,
        y: canvasBBox.y + canvasHeight / 2 + worldY,
      });

      return {
        positions: stacks
          .slice(0, 3)
          .map(([, obj]) => toViewport(obj._pos.x, obj._pos.y)),
        ids: stacks.slice(0, 3).map(([id]) => String(id)),
      };
    });

    if (!stackData || stackData.positions.length < 3) {
      throw new Error('Failed to get stack positions');
    }

    const positions: StackPosition[] = stackData.positions;
    const ids: string[] = stackData.ids;

    // Multi-select first two stacks (Cmd/Ctrl+click)
    await page.mouse.click(positions[0].x, positions[0].y);
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForSelectionSettled();
    });

    await page.keyboard.down('Meta'); // Cmd on Mac
    await page.mouse.click(positions[1].x, positions[1].y);
    await page.keyboard.up('Meta');

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForSelectionSettled();
    });

    // Drag selected stacks onto third stack
    await page.mouse.move(positions[0].x, positions[0].y);
    await page.mouse.down();
    await page.mouse.move(positions[2].x, positions[2].y, { steps: 10 });
    await page.mouse.up();

    // Wait for renderer to process stack operation
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify: first two stacks deleted, third stack has combined cards
    const result = await page.evaluate((stackIds: string[]) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;

      const stack0Exists =
        __TEST_STORE__.getObjectYMap(stackIds[0]) !== undefined;
      const stack1Exists =
        __TEST_STORE__.getObjectYMap(stackIds[1]) !== undefined;
      const stack2YMap = __TEST_STORE__.getObjectYMap(stackIds[2]);
      const stack2Cards = stack2YMap ? stack2YMap.get('_cards') : null;

      return {
        stack0Exists,
        stack1Exists,
        stack2CardCount: stack2Cards?.length ?? 0,
      };
    }, ids);

    expect(result.stack0Exists).toBe(false);
    expect(result.stack1Exists).toBe(false);
    expect(result.stack2CardCount).toBe(6); // 1 + 2 + 3 = 6
  });

  test('should persist merged stacks after page refresh', async ({ page }) => {
    // Get positions and merge two stacks
    const stackData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const canvasBBox = canvas.getBoundingClientRect();

      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const stacks = objects.filter(([, obj]) => obj._kind === 'stack');

      if (stacks.length < 2) return null;

      const [, stack0] = stacks[0];
      const [stack1Id, stack1] = stacks[1];

      const toViewport = (worldX: number, worldY: number) => ({
        x: canvasBBox.x + canvasWidth / 2 + worldX,
        y: canvasBBox.y + canvasHeight / 2 + worldY,
      });

      return {
        stack0Pos: toViewport(stack0._pos.x, stack0._pos.y),
        stack1Pos: toViewport(stack1._pos.x, stack1._pos.y),
        stack1Id: String(stack1Id),
      };
    });

    if (!stackData) {
      throw new Error('Failed to get stack positions');
    }

    const stack0Pos: StackPosition = stackData.stack0Pos;
    const stack1Pos: StackPosition = stackData.stack1Pos;
    const stack1Id: string = stackData.stack1Id;

    // Merge stacks
    await page.mouse.click(stack0Pos.x, stack0Pos.y);
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForSelectionSettled();
    });

    await page.mouse.move(stack0Pos.x, stack0Pos.y);
    await page.mouse.down();
    await page.mouse.move(stack1Pos.x, stack1Pos.y, { steps: 10 });
    await page.mouse.up();

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify merge succeeded
    const cardCountBeforeRefresh = await page.evaluate((id: string) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const stack1YMap = __TEST_STORE__.getObjectYMap(id);
      const stack1Cards = stack1YMap ? stack1YMap.get('_cards') : null;
      return stack1Cards?.length ?? 0;
    }, stack1Id);

    expect(cardCountBeforeRefresh).toBe(3);

    // Refresh the page
    await page.reload();

    // Wait for store to be ready again
    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );

    await page.waitForFunction(
      () => {
        return (globalThis as any).__TEST_BOARD__ !== undefined;
      },
      { timeout: 5000 },
    );

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify merged stack persisted
    const cardCountAfterRefresh = await page.evaluate((id: string) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const stack1YMap = __TEST_STORE__.getObjectYMap(id);
      const stack1Cards = stack1YMap ? stack1YMap.get('_cards') : null;
      return stack1Cards?.length ?? 0;
    }, stack1Id);

    expect(cardCountAfterRefresh).toBe(3);
  });

  test('should persist unstacked cards after page refresh', async ({
    page,
  }) => {
    // Get a multi-card stack and unstack a card
    const stackData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const canvasBBox = canvas.getBoundingClientRect();

      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const multiCardStack = objects.find(
        ([, obj]) =>
          obj._kind === 'stack' && obj._cards && obj._cards.length >= 2,
      );

      if (!multiCardStack) return null;

      const [, stack] = multiCardStack;

      const viewportX = canvasBBox.x + canvasWidth / 2 + stack._pos.x;
      const viewportY = canvasBBox.y + canvasHeight / 2 + stack._pos.y;

      return {
        stackPos: { x: viewportX, y: viewportY },
      };
    });

    if (!stackData) {
      throw new Error('Failed to find multi-card stack');
    }

    const stackPos: StackPosition = stackData.stackPos;

    // Unstack a card
    const handleX: number = stackPos.x + 25;
    const handleY: number = stackPos.y - 35;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 100, handleY, { steps: 10 });
    await page.mouse.up();

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Get stack count before refresh
    const stackCountBeforeRefresh = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const allObjects = Array.from(__TEST_STORE__.getAllObjects().values());
      return allObjects.filter((obj: any) => obj._kind === 'stack').length;
    });

    // Refresh the page
    await page.reload();

    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );

    await page.waitForFunction(
      () => {
        return (globalThis as any).__TEST_BOARD__ !== undefined;
      },
      { timeout: 5000 },
    );

    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify stack count persisted (unstack created a new stack)
    const stackCountAfterRefresh = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const allObjects = Array.from(__TEST_STORE__.getAllObjects().values());
      return allObjects.filter((obj: any) => obj._kind === 'stack').length;
    });

    expect(stackCountAfterRefresh).toBe(stackCountBeforeRefresh);
  });

  test('should immediately drag new stack after unstack without second click', async ({
    page,
  }) => {
    // Get a multi-card stack and its position
    const stackData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const canvasBBox = canvas.getBoundingClientRect();

      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const multiCardStack = objects.find(
        ([, obj]) =>
          obj._kind === 'stack' && obj._cards && obj._cards.length >= 2,
      );

      if (!multiCardStack) return null;

      const [, stack] = multiCardStack;

      const viewportX = canvasBBox.x + canvasWidth / 2 + stack._pos.x;
      const viewportY = canvasBBox.y + canvasHeight / 2 + stack._pos.y;

      return {
        stackPos: { x: viewportX, y: viewportY },
      };
    });

    if (!stackData) {
      throw new Error('Failed to find multi-card stack');
    }

    const stackPos: StackPosition = stackData.stackPos;

    // Calculate unstack handle position (upper-right corner)
    const handleX: number = stackPos.x + 25;
    const handleY: number = stackPos.y - 35;

    // Drag unstack handle to extract top card and continue dragging
    // This should immediately start dragging the new stack without requiring a second click
    const dragEndX = handleX + 200;
    const dragEndY = handleY + 100;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(dragEndX, dragEndY, { steps: 20 }); // More steps for smooth continuous drag
    await page.mouse.up();

    // Wait for renderer to process unstack operation
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify: a new stack should exist and be positioned near the drag end point
    const result = await page.evaluate(
      (data: {
        originalStackPos: { x: number; y: number };
        dragEndX: number;
        dragEndY: number;
      }) => {
        const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;

        const canvasWidth = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;
        const canvasBBox = canvas.getBoundingClientRect();

        // Convert drag end viewport coordinates back to world coordinates
        const dragEndWorldX = data.dragEndX - canvasBBox.x - canvasWidth / 2;
        const dragEndWorldY = data.dragEndY - canvasBBox.y - canvasHeight / 2;

        const allObjects = Array.from(__TEST_STORE__.getAllObjects().entries());
        const stacks = allObjects.filter(([, obj]) => obj._kind === 'stack');

        // Find new stack (should be close to drag end position)
        // Original stack was at (-220, -200), new stack should be ~200px right and ~100px down
        const originalWorldX =
          data.originalStackPos.x - canvasBBox.x - canvasWidth / 2;
        const originalWorldY =
          data.originalStackPos.y - canvasBBox.y - canvasHeight / 2;

        const newStack = stacks.find(([, stack]) => {
          // New stack should be significantly displaced from original position
          const dx = stack._pos.x - originalWorldX;
          const dy = stack._pos.y - originalWorldY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance > 150; // More than 150px away from original
        });

        if (!newStack) {
          return {
            found: false,
            newStackPos: null,
            expectedPos: { x: dragEndWorldX, y: dragEndWorldY },
          };
        }

        const [, stack] = newStack;

        // Calculate distance from drag end position
        const dx = stack._pos.x - dragEndWorldX;
        const dy = stack._pos.y - dragEndWorldY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return {
          found: true,
          newStackPos: stack._pos,
          expectedPos: { x: dragEndWorldX, y: dragEndWorldY },
          distance,
        };
      },
      {
        originalStackPos: stackPos,
        dragEndX,
        dragEndY,
      },
    );

    expect(result?.found).toBe(true);
    // New stack should be within 100px of where we dragged to (accounts for snap-to-grid, etc.)
    expect(result?.distance).toBeLessThan(100);
  });

  test('should merge stack onto rotated/exhausted target stack', async ({
    page,
  }) => {
    // Get two stacks and rotate the target stack (exhaust it)
    const stackData = await page.evaluate(() => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const canvasBBox = canvas.getBoundingClientRect();

      const objects = Array.from(__TEST_STORE__.getAllObjects().entries());
      const stacks = objects.filter(([, obj]) => obj._kind === 'stack');

      if (stacks.length < 2) return null;

      const [sourceId, source] = stacks[0];
      const [targetId, target] = stacks[1];

      const toViewport = (worldX: number, worldY: number) => ({
        x: canvasBBox.x + canvasWidth / 2 + worldX,
        y: canvasBBox.y + canvasHeight / 2 + worldY,
      });

      return {
        sourcePos: toViewport(source._pos.x, source._pos.y),
        targetPos: toViewport(target._pos.x, target._pos.y),
        sourceId: String(sourceId),
        targetId: String(targetId),
        sourceCardCount: source._cards?.length ?? 0,
        targetCardCount: target._cards?.length ?? 0,
      };
    });

    if (!stackData) {
      throw new Error('Failed to get stack positions');
    }

    const sourcePos: StackPosition = stackData.sourcePos;
    const targetPos: StackPosition = stackData.targetPos;
    const sourceId: string = stackData.sourceId;
    const targetId: string = stackData.targetId;
    const sourceCardCount: number = stackData.sourceCardCount;
    const targetCardCount: number = stackData.targetCardCount;

    // Select and exhaust the target stack (rotate 90 degrees)
    await page.mouse.click(targetPos.x, targetPos.y);
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForSelectionSettled();
    });

    // Press 'e' to exhaust (rotate)
    await page.keyboard.press('e');

    // Wait for renderer to process rotation
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify target is rotated
    const targetRotation = await page.evaluate((id: string) => {
      const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;
      const targetYMap = __TEST_STORE__.getObjectYMap(id);
      const pos = targetYMap ? targetYMap.get('_pos') : null;
      return pos ? pos.r : 0;
    }, targetId);

    expect(targetRotation).toBe(90); // Exhausted = 90 degrees

    // Now drag source stack onto the rotated target stack
    await page.mouse.click(sourcePos.x, sourcePos.y);
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForSelectionSettled();
    });

    await page.mouse.move(sourcePos.x, sourcePos.y);
    await page.mouse.down();
    await page.mouse.move(targetPos.x, targetPos.y, { steps: 10 });
    await page.mouse.up();

    // Wait for renderer to process stack merge
    await page.evaluate(async () => {
      await (globalThis as any).__TEST_BOARD__.waitForRenderer();
    });

    // Verify: source stack deleted, target stack has combined cards
    const result = await page.evaluate(
      (ids: {
        sourceId: string;
        targetId: string;
        expectedCardCount: number;
      }) => {
        const __TEST_STORE__ = (globalThis as any).__TEST_STORE__ as TestStore;

        const sourceExists =
          __TEST_STORE__.getObjectYMap(ids.sourceId) !== undefined;
        const targetYMap = __TEST_STORE__.getObjectYMap(ids.targetId);
        const targetCards = targetYMap ? targetYMap.get('_cards') : null;

        return {
          sourceExists,
          targetCardCount: targetCards?.length ?? 0,
        };
      },
      {
        sourceId,
        targetId,
        expectedCardCount: sourceCardCount + targetCardCount,
      },
    );

    expect(result.sourceExists).toBe(false);
    expect(result.targetCardCount).toBe(sourceCardCount + targetCardCount);
  });
});
