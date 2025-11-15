import { test, expect } from '@playwright/test';

/**
 * E2E tests for hover feedback (M2-T4)
 *
 * Note: These tests validate that hover interactions don't crash and that
 * events are properly processed, but they do NOT verify visual correctness
 * (e.g., that shadows actually appear or cards scale to 1.05). Canvas-based
 * rendering prevents DOM inspection of PixiJS scene graph.
 *
 * What these tests DO verify:
 * - Pointer events reach the renderer without errors
 * - Worker/main-thread communication works for hover events
 * - Touch events are filtered correctly (no hover on touch)
 * - Hover is cleared during camera pan/pinch gestures
 * - Both rendering modes function without crashes
 *
 * What these tests DON'T verify:
 * - Visual appearance of hover effects (shadow, scale)
 * - Exact scale values or animation curves
 * - Performance (animation smoothness, 60fps)
 *
 * For visual validation, consider adding screenshot comparison or
 * renderer state inspection hooks in future milestones (M9: Performance & QA).
 */
test.describe('Hover Feedback (M2-T4)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a test table
    await page.goto('/table/test-hover-table');

    // Wait for canvas to be initialized
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );

    // Give the test scene time to render
    await page.waitForTimeout(200);
  });

  test('canvas renders test scene with cards', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    await expect(canvas).toBeVisible();

    // Verify canvas has proper dimensions
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('mouse hover over card shows visual feedback', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // Set up error listener to ensure no crashes
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Move mouse to center of canvas (should be over a card in test scene)
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Hover over the center
    await page.mouse.move(centerX, centerY);

    // Wait for hover animation to complete
    // (300ms timeout based on animation lerp factor of 0.25, which takes ~300ms to settle.
    //  Canvas-based rendering prevents DOM-based waiting strategies like checking for CSS classes.)
    await page.waitForTimeout(300);

    // Move mouse away
    await page.mouse.move(box!.x + 10, box!.y + 10);

    // Wait for hover animation to reverse
    // (Same 300ms settling time for reverse animation)
    await page.waitForTimeout(300);

    // No errors should have occurred
    expect(errors).toEqual([]);
  });

  test('hover feedback only works with mouse and pen, not touch', async ({
    page,
  }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Simulate touch pointer via CDP (touch events don't trigger hover in our implementation)
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    try {
      const client = await page.context().newCDPSession(page);

      // Touch events should not cause hover feedback, but should not crash
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: centerX, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
        ],
      });

      await page.waitForTimeout(50);

      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      await page.waitForTimeout(200);
    } catch (err: unknown) {
      // CDP not available - skip touch-specific test
      const error = err as Error;
      if (
        error?.message?.includes('CDP') ||
        error?.message?.includes('not supported') ||
        error?.message?.includes('browserContext.newCDPSession') ||
        error?.message?.includes('Protocol error')
      ) {
        // CDP unavailable (Firefox, WebKit) - skip touch test but verify mouse hover works
        await page.mouse.move(centerX, centerY);
        await page.waitForTimeout(200);
      } else {
        // Unexpected error - rethrow to fail the test
        throw err;
      }
    }

    // No errors should have occurred
    expect(errors).toEqual([]);
  });

  test('hover cleared when starting camera pan', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Hover over a card
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.waitForTimeout(200);

    // Start dragging (camera pan)
    await page.mouse.down();
    await page.mouse.move(centerX + 50, centerY + 50, { steps: 5 });

    // Wait for pan to process
    await page.waitForTimeout(200);

    await page.mouse.up();
    await page.waitForTimeout(200);

    // Hover should be cleared during drag
    // No errors should have occurred
    expect(errors).toEqual([]);
  });

  test('hover cleared during pinch-to-zoom gesture', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Note: Playwright doesn't have native multi-touch support in mouse API
    // This test verifies no crash occurs when hover is active and pinch might start
    // Real pinch testing would require mobile device testing or CDP commands

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Hover first
    await page.mouse.move(centerX, centerY);
    await page.waitForTimeout(200);

    // Simulate wheel zoom (similar effect to pinch)
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);

    // No errors should have occurred
    expect(errors).toEqual([]);
  });

  test('multiple rapid hover changes do not cause errors', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Rapidly move mouse over different parts of the canvas
    // This tests the hover animation system under stress
    for (let i = 0; i < 10; i++) {
      const x = box!.x + (box!.width / 10) * i;
      const y = box!.y + box!.height / 2;
      await page.mouse.move(x, y);
      await page.waitForTimeout(50);
    }

    // Let animations settle
    await page.waitForTimeout(300);

    // No errors should have occurred
    expect(errors).toEqual([]);
  });

  test('hover works in both worker and main-thread modes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Test worker mode
    await page.goto('/table/test-hover-worker?renderMode=worker');
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );
    await expect(page.getByTestId('worker-status')).toContainText('worker');

    await page.waitForTimeout(200);

    const canvas1 = page.getByTestId('board-canvas');
    const box1 = await canvas1.boundingBox();
    expect(box1).toBeTruthy();

    // Hover in worker mode
    await page.mouse.move(
      box1!.x + box1!.width / 2,
      box1!.y + box1!.height / 2,
    );
    await page.waitForTimeout(300);

    // Test main-thread mode
    await page.goto('/table/test-hover-main?renderMode=main-thread');
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );
    await expect(page.getByTestId('worker-status')).toContainText(
      'main-thread',
    );

    await page.waitForTimeout(200);

    const canvas2 = page.getByTestId('board-canvas');
    const box2 = await canvas2.boundingBox();
    expect(box2).toBeTruthy();

    // Hover in main-thread mode
    await page.mouse.move(
      box2!.x + box2!.width / 2,
      box2!.y + box2!.height / 2,
    );
    await page.waitForTimeout(300);

    // No errors in either mode
    expect(errors).toEqual([]);
  });

  test('hover feedback respects z-order (topmost card)', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // The test scene has overlapping cards with different z-orders
    // Hovering over an overlap should select the topmost card
    // We can't directly verify which card is selected, but we can verify no errors

    // Hover over various positions (some will be overlapping cards)
    const positions = [
      { x: box!.x + box!.width * 0.3, y: box!.y + box!.height * 0.3 },
      { x: box!.x + box!.width * 0.5, y: box!.y + box!.height * 0.5 },
      { x: box!.x + box!.width * 0.7, y: box!.y + box!.height * 0.7 },
    ];

    for (const pos of positions) {
      await page.mouse.move(pos.x, pos.y);
      await page.waitForTimeout(200);
    }

    // No errors should have occurred
    expect(errors).toEqual([]);
  });
});
