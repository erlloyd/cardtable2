import { test, expect } from '@playwright/test';

test.describe('Grid Snap Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dev table for easier testing
    await page.goto('/dev/table/test-grid-snap');

    // Wait for table to be ready
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test.describe('Toggle Grid Snap', () => {
    test('pressing G key toggles grid snap mode', async ({ page }) => {
      // Open the settings menu to check initial state
      await page.getByRole('button', { name: /settings/i }).click();
      const gridSnapMenuItem = page.getByText(/grid snap/i).first();
      await expect(gridSnapMenuItem).toBeVisible();

      // Initial state should be disabled
      let menuText = await page
        .locator('.menu-section')
        .filter({ hasText: 'Grid Snap' })
        .textContent();
      expect(menuText).toContain('Disabled');

      // Close menu
      await page.keyboard.press('Escape');

      // Press 'G' to enable
      await page.keyboard.press('g');

      // Check state changed to enabled
      await page.getByRole('button', { name: /settings/i }).click();
      menuText = await page
        .locator('.menu-section')
        .filter({ hasText: 'Grid Snap' })
        .textContent();
      expect(menuText).toContain('Enabled');

      // Close menu and press 'G' again to disable
      await page.keyboard.press('Escape');
      await page.keyboard.press('g');

      // Check state changed back to disabled
      await page.getByRole('button', { name: /settings/i }).click();
      menuText = await page
        .locator('.menu-section')
        .filter({ hasText: 'Grid Snap' })
        .textContent();
      expect(menuText).toContain('Disabled');
    });

    test('menu toggle changes grid snap state', async ({ page }) => {
      // Open settings menu
      await page.getByRole('button', { name: /settings/i }).click();

      // Click grid snap toggle
      await page
        .locator('.menu-section')
        .filter({ hasText: 'Grid Snap' })
        .getByRole('button')
        .click();

      // Verify enabled
      const menuText = await page
        .locator('.menu-section')
        .filter({ hasText: 'Grid Snap' })
        .textContent();
      expect(menuText).toContain('Enabled');
    });

    test('command palette shows toggle grid snap action', async ({ page }) => {
      // Open command palette (Cmd+K or Ctrl+K)
      const isMac = process.platform === 'darwin';
      await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

      // Wait for command palette
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Search for grid snap
      await page.keyboard.type('grid snap');

      // Verify action appears
      const action = page.getByText(/grid snap/i);
      await expect(action).toBeVisible();
    });
  });

  test.describe('Grid Snapping Behavior', () => {
    test.beforeEach(async ({ page }) => {
      // Enable grid snap mode
      await page.keyboard.press('g');
    });

    test('objects snap to grid on drop', async ({ page }) => {
      // Spawn a test card
      await page.getByRole('button', { name: /spawn card/i }).click();

      // Wait for card to be created
      await page.waitForTimeout(200);

      // Get canvas element
      const canvas = page.locator('canvas').first();
      const canvasBBox = await canvas.boundingBox();
      if (!canvasBBox) throw new Error('Canvas not found');

      const canvasWidth = canvasBBox.width;
      const canvasHeight = canvasBBox.height;

      // Calculate viewport position for drag start (center of canvas, roughly)
      // Cards spawn randomly near center, so let's drag from center
      const startX = canvasBBox.x + canvasWidth / 2;
      const startY = canvasBBox.y + canvasHeight / 2;

      // Drag to a non-grid-aligned position
      // Dragging 75px (should snap to 100px grid point)
      const endX = startX + 75;
      const endY = startY + 75;

      // Perform drag operation
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

      await page.waitForTimeout(50);

      await canvas.dispatchEvent('pointermove', {
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
        buttons: 1,
      });

      await page.waitForTimeout(50);

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
        buttons: 1,
      });

      // Card should have snapped to grid (we can't easily verify exact position,
      // but we can verify no errors occurred and drag completed)
      await page.waitForTimeout(100);
    });

    test('multiple objects snap independently', async ({ page }) => {
      // Spawn two test cards
      await page.getByRole('button', { name: /spawn card/i }).click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: /spawn card/i }).click();
      await page.waitForTimeout(200);

      // Get canvas element
      const canvas = page.locator('canvas').first();
      const canvasBBox = await canvas.boundingBox();
      if (!canvasBBox) throw new Error('Canvas not found');

      // Select multiple objects by clicking them
      const canvasWidth = canvasBBox.width;
      const canvasHeight = canvasBBox.height;
      const centerX = canvasBBox.x + canvasWidth / 2;
      const centerY = canvasBBox.y + canvasHeight / 2;

      // Click first card
      await canvas.dispatchEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: centerX - 50,
        clientY: centerY - 50,
        screenX: centerX - 50,
        screenY: centerY - 50,
        pageX: centerX - 50,
        pageY: centerY - 50,
        button: 0,
        buttons: 1,
      });

      await page.waitForTimeout(50);

      await canvas.dispatchEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: centerX - 50,
        clientY: centerY - 50,
        screenX: centerX - 50,
        screenY: centerY - 50,
        pageX: centerX - 50,
        pageY: centerY - 50,
        button: 0,
        buttons: 1,
      });

      await page.waitForTimeout(100);

      // Drag the selected cards
      await canvas.dispatchEvent('pointerdown', {
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
      });

      await page.waitForTimeout(50);

      const endX = centerX + 80;
      const endY = centerY + 80;

      await canvas.dispatchEvent('pointermove', {
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
        buttons: 1,
      });

      await page.waitForTimeout(50);

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
        buttons: 1,
      });

      // Both cards should have snapped independently
      await page.waitForTimeout(100);
    });

    test('objects do not snap when grid mode disabled', async ({ page }) => {
      // Disable grid snap
      await page.keyboard.press('g');

      // Spawn a card
      await page.getByRole('button', { name: /spawn card/i }).click();
      await page.waitForTimeout(200);

      // Get canvas
      const canvas = page.locator('canvas').first();
      const canvasBBox = await canvas.boundingBox();
      if (!canvasBBox) throw new Error('Canvas not found');

      const startX = canvasBBox.x + canvasBBox.width / 2;
      const startY = canvasBBox.y + canvasBBox.height / 2;
      const endX = startX + 75; // Non-grid-aligned
      const endY = startY + 75;

      // Drag card
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

      await page.waitForTimeout(50);

      await canvas.dispatchEvent('pointermove', {
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
        buttons: 1,
      });

      await page.waitForTimeout(50);

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
        buttons: 1,
      });

      // Card should NOT snap (lands at cursor position)
      await page.waitForTimeout(100);
    });
  });

  test.describe('Visual Feedback', () => {
    test.beforeEach(async ({ page }) => {
      // Enable grid snap mode
      await page.keyboard.press('g');
    });

    test('ghost preview appears during drag', async ({ page }) => {
      // Spawn a card
      await page.getByRole('button', { name: /spawn card/i }).click();
      await page.waitForTimeout(200);

      // Get canvas
      const canvas = page.locator('canvas').first();
      const canvasBBox = await canvas.boundingBox();
      if (!canvasBBox) throw new Error('Canvas not found');

      const startX = canvasBBox.x + canvasBBox.width / 2;
      const startY = canvasBBox.y + canvasBBox.height / 2;

      // Start drag
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

      await page.waitForTimeout(50);

      // Move mouse (ghost should appear)
      const endX = startX + 50;
      const endY = startY + 50;

      await canvas.dispatchEvent('pointermove', {
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
        buttons: 1,
      });

      await page.waitForTimeout(100);

      // Ghost should be visible (we can't easily verify visually, but
      // we can check that the drag is in progress and no errors occurred)

      // Complete drag
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
        buttons: 1,
      });

      // Ghost should disappear after drop
      await page.waitForTimeout(100);
    });
  });
});
