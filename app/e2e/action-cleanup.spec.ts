/**
 * Plugin-derived actions must not outlive the table that registered them
 * (ct-ajw.57).
 *
 * Attachment actions ("Add Damage Token") and per-type Load commands
 * ("Load Scenario…") are registered while a plugin table is mounted. Client-
 * side navigating to another table must drop them, otherwise table B's command
 * palette offers table A's plugin commands.
 */

import type { Page } from '@playwright/test';
import { test, expect, skipNextAutoClear } from './_fixtures';

interface CleanupTestStore {
  metadata: {
    set: (key: string, value: unknown) => void;
  };
  waitForReady: () => Promise<void>;
  getGameAssets: () => unknown;
}

interface CleanupTestGlobalThis {
  __TEST_STORE__?: CleanupTestStore;
}

async function openCommandPalette(page: Page): Promise<void> {
  await page.click('button[aria-label="Open command palette"]');
  await expect(
    page.locator('input[placeholder*="Search"]').first(),
  ).toBeVisible({ timeout: 2_000 });
}

function paletteLabel(page: Page, label: string) {
  return page.locator('.command-palette-label').filter({ hasText: label });
}

test('plugin attachment and Load commands are gone after navigating to another table', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '-');
  const tableA = `cleanup-a-${suffix}`;
  const tableB = `cleanup-b-${suffix}`;

  // Table A: bind to the testgame plugin (write pluginId, reload so the mount
  // effect loads the plugin assets).
  await page.goto(`/table/${tableA}`);
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as CleanupTestGlobalThis).__TEST_STORE__),
  );
  await page.evaluate(async () => {
    const store = (globalThis as unknown as CleanupTestGlobalThis)
      .__TEST_STORE__;
    await store?.waitForReady();
    store?.metadata.set('pluginId', 'testgame');
  });
  skipNextAutoClear(page);
  await page.goto(`/table/${tableA}`);
  await page.waitForFunction(
    () => {
      const store = (globalThis as unknown as CleanupTestGlobalThis)
        .__TEST_STORE__;
      return store?.getGameAssets() != null;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('canvas').first().waitFor({ timeout: 10_000 });

  // Precondition: A's plugin commands are live.
  await openCommandPalette(page);
  await expect(paletteLabel(page, 'Load Scenario…').first()).toBeVisible();
  await page
    .locator('input[placeholder*="Search"]')
    .first()
    .fill('Damage Token');
  await expect(paletteLabel(page, 'Add Damage Token').first()).toBeVisible();

  // Client-side navigation (no reload, so module-level registries persist) to
  // a table with no plugin: TanStack Router listens to popstate.
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/dev/table/${tableB}`);
  await page.waitForURL(`**/dev/table/${tableB}`);
  await page.locator('canvas').first().waitFor({ timeout: 10_000 });

  await openCommandPalette(page);
  await expect(paletteLabel(page, 'Close Table').first()).toBeVisible();
  await expect(paletteLabel(page, 'Load Scenario…')).toHaveCount(0);
  await page
    .locator('input[placeholder*="Search"]')
    .first()
    .fill('Damage Token');
  await expect(paletteLabel(page, 'Add Damage Token')).toHaveCount(0);
});

test('a plugin load still in flight when the table unmounts does not register commands on the next table (ct-ajw.61)', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '-');
  const tableA = `inflight-a-${suffix}`;
  const tableB = `inflight-b-${suffix}`;

  // Bind table A to the testgame plugin, then reload so the mount effect
  // starts the plugin load.
  await page.goto(`/table/${tableA}`);
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as CleanupTestGlobalThis).__TEST_STORE__),
  );
  await page.evaluate(async () => {
    const store = (globalThis as unknown as CleanupTestGlobalThis)
      .__TEST_STORE__;
    await store?.waitForReady();
    store?.metadata.set('pluginId', 'testgame');
  });

  // Hold the plugin manifest response so the load is pending across the
  // navigation.
  let releaseManifest: () => void = () => {};
  const manifestHeld = new Promise<void>((resolve) => {
    releaseManifest = resolve;
  });
  let manifestRequested: () => void = () => {};
  const manifestRequestSeen = new Promise<void>((resolve) => {
    manifestRequested = resolve;
  });
  await page.route('**/plugins/testgame/index.json', async (route) => {
    manifestRequested();
    await manifestHeld;
    await route.continue();
  });

  skipNextAutoClear(page);
  await page.goto(`/table/${tableA}`);
  await manifestRequestSeen;

  // Navigate away while the load is still pending.
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/dev/table/${tableB}`);
  await page.waitForURL(`**/dev/table/${tableB}`);
  await page.locator('canvas').first().waitFor({ timeout: 10_000 });

  // Release the stale load and let it run to completion.
  const coreLoaded = page.waitForResponse(
    '**/plugins/testgame/testgame-core.json',
  );
  releaseManifest();
  await coreLoaded;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      }),
  );

  await openCommandPalette(page);
  await expect(paletteLabel(page, 'Close Table').first()).toBeVisible();
  await expect(paletteLabel(page, 'Load Scenario…')).toHaveCount(0);
  await page
    .locator('input[placeholder*="Search"]')
    .first()
    .fill('Damage Token');
  await expect(paletteLabel(page, 'Add Damage Token')).toHaveCount(0);
});
