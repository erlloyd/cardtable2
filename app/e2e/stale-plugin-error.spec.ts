/**
 * E2E test for the stale-plugin error UI (ct-f7f).
 *
 * Setup: write a bogus `pluginId` into the table's Y.Doc metadata, reload the
 * production `/table/:id` route, and assert the explicit "plugin no longer
 * available" error UI renders with the missing pluginId named in the message
 * and the action buttons present and functional.
 *
 * The auto-clear fixture only clears `objects` — `metadata` survives, so the
 * pluginId we set persists across the reload that triggers the load path.
 */

import { test, expect } from './_fixtures';

interface TestStoreWithMetadata {
  metadata: {
    set: (key: string, value: unknown) => void;
    get: (key: string) => unknown;
    delete: (key: string) => void;
  };
  waitForReady: () => Promise<void>;
}

interface TestGlobalThis {
  __TEST_STORE__?: TestStoreWithMetadata;
}

const MISSING_PLUGIN_ID = 'nonexistent-plugin-foo';

test.describe('Stale plugin error UI (ct-f7f)', () => {
  test('renders explicit plugin-not-found UI when metadata references a missing plugin', async ({
    page,
  }, testInfo) => {
    // Use the production /table/:id route — that's where users hit this case
    // after their saved table's plugin disappears from pluginsIndex.json.
    const tableId = `stale-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);

    // The fixture has cleared `objects` and waited for store ready. Now seed
    // the bogus pluginId into metadata, then reload to trigger the load path.
    await page.evaluate((pluginId) => {
      const store = (globalThis as unknown as TestGlobalThis).__TEST_STORE__;
      if (!store) {
        throw new Error('__TEST_STORE__ not exposed');
      }
      store.metadata.set('pluginId', pluginId);
    }, MISSING_PLUGIN_ID);

    // Reload — this re-runs the load effect with the bogus pluginId now in
    // metadata. `page.reload()` does NOT go through the wrapped goto, so the
    // fixture's auto-clear does not fire here (and metadata would survive it
    // anyway).
    await page.reload();

    // Wait for the new store to be exposed and hydrated.
    await page.waitForFunction(() =>
      Boolean((globalThis as unknown as TestGlobalThis).__TEST_STORE__),
    );
    await page.evaluate(async () => {
      const store = (globalThis as unknown as TestGlobalThis).__TEST_STORE__;
      await store?.waitForReady();
    });

    // Sanity: metadata persisted across the reload.
    const persistedPluginId = await page.evaluate(() => {
      const store = (globalThis as unknown as TestGlobalThis).__TEST_STORE__;
      return store?.metadata.get('pluginId');
    });
    expect(persistedPluginId).toBe(MISSING_PLUGIN_ID);

    // The explicit plugin-not-found error UI should render (not the generic
    // catch-all variant).
    const errorContainer = page.getByTestId('table-error-plugin-not-found');
    await expect(errorContainer).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('table-error-generic')).toHaveCount(0);

    // The missing pluginId is named in the message.
    const pluginIdElement = page.getByTestId('table-error-plugin-id');
    await expect(pluginIdElement).toBeVisible();
    await expect(pluginIdElement).toContainText(MISSING_PLUGIN_ID);

    // Both action buttons render and are interactive.
    const backButton = page.getByTestId('table-error-back-to-games');
    const dismissButton = page.getByTestId('table-error-dismiss');
    await expect(backButton).toBeVisible();
    await expect(backButton).toBeEnabled();
    await expect(dismissButton).toBeVisible();
    await expect(dismissButton).toBeEnabled();

    // Clicking "Back to Games" navigates to the home route.
    await backButton.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('clicking Reset Table dismisses the error overlay', async ({
    page,
  }, testInfo) => {
    const tableId = `stale-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);

    await page.evaluate((pluginId) => {
      const store = (globalThis as unknown as TestGlobalThis).__TEST_STORE__;
      if (!store) {
        throw new Error('__TEST_STORE__ not exposed');
      }
      store.metadata.set('pluginId', pluginId);
    }, MISSING_PLUGIN_ID);

    await page.reload();

    await page.waitForFunction(() =>
      Boolean((globalThis as unknown as TestGlobalThis).__TEST_STORE__),
    );
    await page.evaluate(async () => {
      const store = (globalThis as unknown as TestGlobalThis).__TEST_STORE__;
      await store?.waitForReady();
    });

    const errorContainer = page.getByTestId('table-error-plugin-not-found');
    await expect(errorContainer).toBeVisible({ timeout: 5000 });

    // Click the secondary "Reset Table" action — it dismisses the overlay
    // by clearing `packsError` in the React state. (resetTable preserves
    // pluginId by design, so on a reload the error would re-appear.)
    await page.getByTestId('table-error-dismiss').click();

    // The error overlay should be gone.
    await expect(errorContainer).toHaveCount(0);
  });
});
