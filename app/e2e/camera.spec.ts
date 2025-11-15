import { test, expect } from '@playwright/test';

/**
 * E2E tests for camera controls (M2-T3)
 *
 * Note: These tests validate that camera gestures don't crash and that
 * events are properly processed, but they do NOT verify visual correctness
 * (e.g., that cards actually appear zoomed or camera position changes).
 * Canvas-based rendering prevents DOM inspection of PixiJS transformations.
 *
 * What these tests DO verify:
 * - Pan/zoom gestures reach the renderer without errors
 * - Worker/main-thread communication works for all gestures
 * - Pinch-to-zoom via CDP processes correctly
 * - Transition from pinch to pan doesn't crash
 * - Both rendering modes function without crashes
 * - Unlimited zoom doesn't cause errors
 *
 * What these tests DON'T verify:
 * - Actual camera scale/position values
 * - Visual appearance of zoomed/panned scene
 * - Performance (60fps, smooth animations)
 * - Exact zoom factors or pan distances
 *
 * For visual validation, consider adding screenshot comparison or
 * camera state inspection hooks in future milestones (M9: Performance & QA).
 */
test.describe('Camera Pan and Zoom (M2-T3)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a test table
    await page.goto('/table/test-camera-table');

    // Wait for canvas to be initialized
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
    );
  });

  test('renders canvas with viewport', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    await expect(canvas).toBeVisible();

    // Verify canvas has proper dimensions
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('handles mouse drag to pan camera', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');

    // Get initial canvas position
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // Simulate drag gesture
    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200, { steps: 10 });
    await page.mouse.up();

    // Note: We can't directly verify viewport position changed without
    // exposing viewport state. This test verifies the interaction works
    // without errors.

    // Wait a bit to ensure rendering completes
    await page.waitForTimeout(100);
  });

  test('handles mouse wheel to zoom', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // Move mouse to center of canvas
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Simulate zoom in with wheel
    await page.mouse.wheel(0, -100);

    // Wait for smooth animation
    await page.waitForTimeout(100);

    // Simulate zoom out with wheel
    await page.mouse.wheel(0, 100);

    // Wait for smooth animation
    await page.waitForTimeout(100);
  });

  test('prevents default touch behaviors', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');

    // Verify touch-action CSS is set to none (prevents default touch behaviors)
    await expect(canvas).toHaveCSS('touch-action', 'none');
  });

  test('handles pointer events without crashing', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // Set up error listener before interactions
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Simulate various pointer interactions
    await page.mouse.move(box!.x + 50, box!.y + 50);
    await page.mouse.down();
    await page.mouse.move(box!.x + 60, box!.y + 60);
    await page.mouse.move(box!.x + 70, box!.y + 70);
    await page.mouse.up();

    await page.waitForTimeout(100);
    expect(errors).toEqual([]);
  });

  test('supports unlimited zoom in and out', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Move mouse to center of canvas
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Zoom in significantly (no limits)
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(50);
    }

    // Zoom out significantly (no limits)
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(50);
    }

    // No errors should occur even with extreme zoom
    expect(errors).toEqual([]);
  });

  test('zoom focuses on point under cursor', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Zoom in on different points
    const points = [
      { x: box!.x + box!.width * 0.25, y: box!.y + box!.height * 0.25 },
      { x: box!.x + box!.width * 0.75, y: box!.y + box!.height * 0.75 },
      { x: box!.x + box!.width * 0.5, y: box!.y + box!.height * 0.5 },
    ];

    for (const point of points) {
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(100);
    }

    expect(errors).toEqual([]);
  });

  test('handles rapid pan movements smoothly', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Start at center
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    // Rapid movement in different directions
    const moves = [
      { x: startX + 100, y: startY },
      { x: startX + 100, y: startY + 100 },
      { x: startX, y: startY + 100 },
      { x: startX - 100, y: startY + 100 },
      { x: startX - 100, y: startY },
      { x: startX, y: startY },
    ];

    for (const move of moves) {
      await page.mouse.move(move.x, move.y, { steps: 3 });
      await page.waitForTimeout(50);
    }

    await page.mouse.up();
    await page.waitForTimeout(100);

    expect(errors).toEqual([]);
  });

  test('pinch-to-zoom gesture (simulated via CDP)', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Note: Playwright doesn't have native multi-touch API
    // We simulate pinch by dispatching touch events via Chrome DevTools Protocol
    const client = await page.context().newCDPSession(page);

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    try {
      // Simulate two-finger touch down
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: centerX - 50, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
          { x: centerX + 50, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
        ],
      });

      // Brief pause between CDP events to allow event processing
      // (50ms is sufficient for the renderer to process touch events.
      //  Canvas rendering prevents DOM-based waiting strategies.)
      await page.waitForTimeout(50);

      // Simulate pinch out (zoom in)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: centerX - 100, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
          { x: centerX + 100, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
        ],
      });

      await page.waitForTimeout(50);

      // Simulate touch end
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      await page.waitForTimeout(100);
    } catch (err: unknown) {
      // CDP not available - skip pinch-specific test
      const error = err as Error;
      if (
        error?.message?.includes('CDP') ||
        error?.message?.includes('not supported') ||
        error?.message?.includes('browserContext.newCDPSession') ||
        error?.message?.includes('Protocol error')
      ) {
        // CDP unavailable (Firefox, WebKit) - skip this test explicitly
        test.skip(true, 'CDP not available for pinch-to-zoom test');
      } else {
        // Unexpected error - rethrow to fail the test
        throw err;
      }
    }

    // No errors should have occurred
    expect(errors).toEqual([]);
  });

  test('transition from pinch to pan smoothly', async ({ page }) => {
    const canvas = page.getByTestId('board-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    try {
      const client = await page.context().newCDPSession(page);

      // Start with two fingers (pinch)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: centerX - 50, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
          { x: centerX + 50, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
        ],
      });

      await page.waitForTimeout(50);

      // Lift one finger (transition to pan)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [
          { x: centerX - 50, y: centerY, radiusX: 1, radiusY: 1, force: 1 },
        ],
      });

      await page.waitForTimeout(50);

      // Continue with one finger (pan)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: centerX, y: centerY + 50, radiusX: 1, radiusY: 1, force: 1 },
        ],
      });

      await page.waitForTimeout(50);

      // End gesture
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      await page.waitForTimeout(100);
    } catch (err: unknown) {
      // CDP not available - skip transition-specific test
      const error = err as Error;
      if (
        error?.message?.includes('CDP') ||
        error?.message?.includes('not supported') ||
        error?.message?.includes('browserContext.newCDPSession') ||
        error?.message?.includes('Protocol error')
      ) {
        // CDP unavailable (Firefox, WebKit) - skip this test explicitly
        test.skip(true, 'CDP not available for pinch-to-pan transition test');
      } else {
        // Unexpected error - rethrow to fail the test
        throw err;
      }
    }

    expect(errors).toEqual([]);
  });

  test('works in both worker and main-thread modes', async ({ page }) => {
    // Test worker mode (default)
    await page.goto('/table/test-camera-worker?renderMode=worker');
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
    );
    await expect(page.getByTestId('worker-status')).toContainText('worker');

    const canvas1 = page.getByTestId('board-canvas');
    const box1 = await canvas1.boundingBox();
    expect(box1).toBeTruthy();

    // Perform drag in worker mode
    await page.mouse.move(box1!.x + 100, box1!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box1!.x + 150, box1!.y + 150, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    // Test main-thread mode
    await page.goto('/table/test-camera-main?renderMode=main-thread');
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
    );
    await expect(page.getByTestId('worker-status')).toContainText(
      'main-thread',
    );

    const canvas2 = page.getByTestId('board-canvas');
    const box2 = await canvas2.boundingBox();
    expect(box2).toBeTruthy();

    // Perform drag in main-thread mode
    await page.mouse.move(box2!.x + 100, box2!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box2!.x + 150, box2!.y + 150, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(100);
  });
});
