import { test, expect } from '@playwright/test';

test.describe('Global Menu Bar (M3.5.1-T5)', () => {
  test('should display Command Palette and Settings buttons', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Check for Command Palette button
    const commandButton = page.getByLabel('Open command palette');
    await expect(commandButton).toBeVisible();

    // Check for Settings button
    const settingsButton = page.getByLabel('Settings and actions');
    await expect(settingsButton).toBeVisible();
  });

  test('should open Command Palette when button clicked', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Click Command Palette button
    const commandButton = page.getByLabel('Open command palette');
    await commandButton.click();

    // Verify Command Palette opened (search input appears)
    const paletteInput = page.locator('input[placeholder*="Search"]').first();
    await expect(paletteInput).toBeVisible({ timeout: 2000 });
  });

  test('should open settings menu when settings button clicked', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Click Settings button
    const settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();

    // Verify settings menu opened
    await expect(page.getByText('Interaction Mode')).toBeVisible({
      timeout: 2000,
    });
  });

  test('should show Pan and Select options in settings menu', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Open settings menu
    const settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();

    // Verify Pan and Select options are visible
    await expect(page.getByText('Pan')).toBeVisible();
    await expect(page.getByText('Select')).toBeVisible();
  });

  test('should show checkmark on Pan mode by default', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Open settings menu
    const settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();

    // Pan mode should be active by default (has checkmark)
    const panButton = page.getByText('Pan').locator('..');
    await expect(panButton).toContainText('✓');
  });

  test('should switch to Select mode when clicked in menu', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Open settings menu
    const settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();

    // Click Select option
    await page.getByText('Select').click();

    // Open menu again to verify Select is now active
    await settingsButton.click();
    const selectButton = page.getByText('Select').locator('..');
    await expect(selectButton).toContainText('✓');
  });

  test('should switch back to Pan mode when clicked in menu', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Open settings menu and switch to Select
    let settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    await page.getByText('Select').click();

    // Open menu again and switch back to Pan
    settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    await page.getByText('Pan').click();

    // Verify Pan is now active
    settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    const panButton = page.getByText('Pan').locator('..');
    await expect(panButton).toContainText('✓');
  });

  test('should switch to Select mode when V key pressed', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Press V key
    await page.keyboard.press('v');

    // Open settings menu to verify Select is active
    const settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    const selectButton = page.getByText('Select').locator('..');
    await expect(selectButton).toContainText('✓');
  });

  test('should temporarily switch to Pan mode when Space held', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Switch to select mode first
    await page.keyboard.press('v');

    // Verify we're in select mode
    let settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    let selectButton = page.getByText('Select').locator('..');
    await expect(selectButton).toContainText('✓');

    // Close menu
    await page.keyboard.press('Escape');

    // Dispatch Space keydown event directly to window
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: ' ',
          code: 'Space',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // Should now be in pan mode - open settings menu
    settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();

    // Wait for menu to appear
    await expect(page.getByText('Interaction Mode')).toBeVisible();

    // Verify Pan mode is now active (has checkmark)
    const panButton = page.getByText('Pan').locator('..');
    await expect(panButton).toContainText('✓');

    // Close menu
    await page.keyboard.press('Escape');

    // Dispatch Space keyup event directly to window
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: ' ',
          code: 'Space',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // Should return to select mode
    settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    selectButton = page.getByText('Select').locator('..');
    await expect(selectButton).toContainText('✓');
  });

  test('should close settings menu when clicking outside', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Open settings menu
    const settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    await expect(page.getByText('Interaction Mode')).toBeVisible();

    // Click outside the menu (on an empty area of the page)
    await page.mouse.click(100, 100);

    // Menu should be closed
    await expect(page.getByText('Interaction Mode')).not.toBeVisible();
  });

  test('should close settings menu when pressing Escape', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    // Open settings menu
    const settingsButton = page.getByLabel('Settings and actions');
    await settingsButton.click();
    await expect(page.getByText('Interaction Mode')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Menu should be closed
    await expect(page.getByText('Interaction Mode')).not.toBeVisible();
  });
});

test.describe('Global Menu Bar - Visual Style', () => {
  test('should have both buttons with same purple color', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    const commandButton = page.getByLabel('Open command palette');
    const settingsButton = page.getByLabel('Settings and actions');

    // Both buttons should be visible
    await expect(commandButton).toBeVisible();
    await expect(settingsButton).toBeVisible();

    // Get computed background colors
    const commandBg = await commandButton.evaluate(
      (el: Element): string => window.getComputedStyle(el).backgroundColor,
    );
    const settingsBg = await settingsButton.evaluate(
      (el: Element): string => window.getComputedStyle(el).backgroundColor,
    );

    // Should have the same background color
    expect(commandBg).toBe(settingsBg);
  });

  test('should display command icon and menu icon', async ({
    page,
  }, testInfo) => {
    const tableId = `menubar-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]', { timeout: 5000 });

    const commandButton = page.getByLabel('Open command palette');
    const settingsButton = page.getByLabel('Settings and actions');

    // Command button should contain ⌘ symbol
    await expect(commandButton).toContainText('⌘');

    // Settings button should contain ⋮ symbol
    await expect(settingsButton).toContainText('⋮');
  });
});
