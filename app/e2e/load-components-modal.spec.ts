/**
 * E2E for the Load Components modal (ct-j3t regression coverage).
 *
 * Pins the path that broke in ct-j3t: a freshly-mounted table eagerly loads
 * its plugin assets but never populated the component-set registry, so the
 * Load Components modal opened with "No component sets available". This spec
 * navigates into the testgame plugin (which now declares one static
 * componentSet in its manifest), opens the command palette, clicks "Load
 * Components", and asserts the entry is visible — not the empty-state text.
 *
 * Deliberately does NOT actually load the components or import a deck. The
 * static-load click would write objects to the table, and the API-import
 * path requires an external service. We just verify the UI surface opens
 * and shows what the plugin manifest declared.
 */

import { test, expect } from './_fixtures';

interface LoadComponentsTestGlobalThis {
  __TEST_STORE__?: {
    metadata: { set: (key: string, value: unknown) => void };
    waitForReady: () => Promise<void>;
    getGameAssets: () => unknown;
  };
}

test.describe('Load Components modal', () => {
  test('opens with plugin component sets visible after eager plugin load', async ({
    page,
  }) => {
    // Navigate to a fresh table. The auto-clear fixture wipes any prior
    // CRDT state for this URL — this is the first navigation so there's
    // nothing to clear yet, but the fixture still ensures __TEST_STORE__ is
    // ready before the spec body proceeds.
    await page.goto('/table/load-components-spec');

    // Same pattern as multiplayer-join.spec.ts: write pluginId into Y.Doc
    // metadata to trigger the table route's eager-plugin-load effect. The
    // alternative — clicking through the home page — exercises the same
    // path but adds a navigation hop that's not what we're testing here.
    await page.waitForFunction(() =>
      Boolean(
        (globalThis as unknown as LoadComponentsTestGlobalThis).__TEST_STORE__,
      ),
    );
    await page.evaluate(async () => {
      const store = (globalThis as unknown as LoadComponentsTestGlobalThis)
        .__TEST_STORE__;
      await store?.waitForReady();
    });
    await page.evaluate((pluginId) => {
      const store = (globalThis as unknown as LoadComponentsTestGlobalThis)
        .__TEST_STORE__;
      store?.metadata.set('pluginId', pluginId);
    }, 'testgame');

    // Wait for the eager plugin load to finish populating gameAssets. This
    // is the moment ct-j3t cared about: gameAssets present, but pre-fix the
    // component-set registry was still empty.
    await page.waitForFunction(
      () => {
        const store = (globalThis as unknown as LoadComponentsTestGlobalThis)
          .__TEST_STORE__;
        return store?.getGameAssets() !== null;
      },
      undefined,
      { timeout: 10_000 },
    );

    // Open the command palette and pick "Load Components". The action is
    // available whenever onOpenComponentSets is wired up — independent of
    // whether the registry has anything in it. The test is whether the
    // modal that pops up is empty or populated.
    await page.click('button[aria-label="Open command palette"]');
    await page.getByRole('option', { name: /Load Components/ }).click();

    // The component-set modal opens. Headless UI mounts it lazily, so wait
    // for the .cs-modal-dialog wrapper to appear.
    const modal = page.locator('.cs-modal-dialog');
    await expect(modal).toBeAttached();
    await expect(modal.locator('.cs-modal-panel')).toBeVisible();

    // Substantive assertion: the entry declared in testgame's manifest
    // shows up. Pre-ct-j3t this would have been empty.
    await expect(modal.getByText('Test Starter Pack')).toBeVisible();

    // Negative assertion: the empty-state text is NOT shown. This is what
    // the user actually saw before the fix.
    await expect(
      modal.getByText('No component sets available'),
    ).not.toBeVisible();
  });
});
