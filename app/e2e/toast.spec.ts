/**
 * E2E coverage for the toast notification system (ct-e9m.4).
 *
 * Proves the whole chain in a real browser: a failed scenario load ->
 * showToast -> Toaster mounted in the root route -> visible over the canvas
 * -> gone after the auto-dismiss timer, with no blocking browser dialog.
 *
 * Helpers are copied from loadables.spec.ts (testgame plugin table setup +
 * command palette).
 */

import type { Page } from '@playwright/test';
import { test, expect, skipNextAutoClear } from './_fixtures';

interface ToastTestStore {
  metadata: { set: (key: string, value: unknown) => void };
  waitForReady: () => Promise<void>;
  getGameAssets: () => unknown;
  getAllObjects: () => Map<string, unknown>;
}

interface ToastTestGlobalThis {
  __TEST_STORE__?: ToastTestStore;
}

/** Drive a fresh table at `/table/<id>` into the testgame plugin context. */
async function setupTestgameTable(page: Page, tableId: string): Promise<void> {
  await page.goto(`/table/${tableId}`);
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as ToastTestGlobalThis).__TEST_STORE__),
  );
  await page.evaluate(async () => {
    const store = (globalThis as unknown as ToastTestGlobalThis).__TEST_STORE__;
    await store?.waitForReady();
  });
  await page.evaluate((pluginId) => {
    const store = (globalThis as unknown as ToastTestGlobalThis).__TEST_STORE__;
    store?.metadata.set('pluginId', pluginId);
  }, 'testgame');

  skipNextAutoClear(page);
  await page.goto(`/table/${tableId}`);

  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as ToastTestGlobalThis).__TEST_STORE__),
  );
  await page.waitForFunction(
    () => {
      const store = (globalThis as unknown as ToastTestGlobalThis)
        .__TEST_STORE__;
      return store?.getGameAssets() !== null;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('canvas').first().waitFor({ timeout: 10_000 });
}

async function getObjectCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as ToastTestGlobalThis).__TEST_STORE__;
    return store ? store.getAllObjects().size : 0;
  });
}

async function openCommandPalette(page: Page): Promise<void> {
  await page.click('button[aria-label="Open command palette"]');
  await expect(
    page.locator('input[placeholder*="Search"]').first(),
  ).toBeVisible({ timeout: 2_000 });
}

/** Command palette -> Load… -> Scenario -> testgame-basic. */
async function loadTestgameBasicScenario(page: Page): Promise<void> {
  await openCommandPalette(page);
  await page
    .locator('.command-palette-label')
    .filter({ hasText: /^Load…$/ })
    .first()
    .click();
  await page.getByTestId('load-picker-type-scenario').click();
  await page.getByTestId('load-picker-item-testgame-basic').click();
}

test.describe('Toast notifications (ct-e9m.4)', () => {
  test('failed scenario load shows an auto-dismissing error toast, no dialog', async ({
    page,
  }, testInfo) => {
    const tableId = `toast-fail-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    let dialogSeen = false;
    page.on('dialog', (dialog) => {
      dialogSeen = true;
      void dialog.dismiss();
    });

    await setupTestgameTable(page, tableId);
    await page.route('**/testgame-basic.json', (route) =>
      route.fulfill({ status: 500, body: 'boom' }),
    );

    await loadTestgameBasicScenario(page);

    const toast = page
      .getByRole('alert')
      .filter({ hasText: 'Failed to load scenario' });
    await expect(toast).toBeVisible();
    await expect(toast).not.toHaveText(
      /Failed to load scenario.*Failed to load scenario/,
    );
    expect(await getObjectCount(page)).toBe(0);

    // TOAST_DURATION_MS + 3s slack.
    await expect(toast).toHaveCount(0, { timeout: 10_000 });
    expect(dialogSeen).toBe(false);
  });

  test('close button dismisses the toast immediately', async ({
    page,
  }, testInfo) => {
    const tableId = `toast-close-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await setupTestgameTable(page, tableId);
    await page.route('**/testgame-basic.json', (route) =>
      route.fulfill({ status: 500, body: 'boom' }),
    );

    await loadTestgameBasicScenario(page);

    const toast = page
      .getByRole('alert')
      .filter({ hasText: 'Failed to load scenario' });
    await expect(toast).toBeVisible();

    await toast.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(toast).toHaveCount(0, { timeout: 1_000 });
  });
});
