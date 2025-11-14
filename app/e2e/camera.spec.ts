import { test, expect } from '@playwright/test';

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
