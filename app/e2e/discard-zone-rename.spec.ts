/**
 * E2E for renaming a discard zone (ct-a5a.4).
 *
 * Flow: seed a stack, run "Create Discard Zone" from the command palette,
 * select the zone, run "Rename…", type a new label, press Enter, and assert
 * `_meta.label` in the store. The label itself is drawn on the worker canvas,
 * so rendering is covered by the store write plus the renderer pass completing.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _meta?: Record<string, unknown>;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, StoreObject>;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __TEST_BOARD__?: {
    waitForRenderer: () => Promise<void>;
    waitForSelectionSettled: () => Promise<void>;
  };
  __ctTest?: { click: (pt: { x: number; y: number }) => void };
}

async function waitForReady(page: Page) {
  await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByTestId('worker-status')).toContainText('Initialized', {
    timeout: 5000,
  });
  await expect(page.getByTestId('board-canvas')).toBeVisible({ timeout: 5000 });
  await page.waitForFunction(
    () => {
      const g = globalThis as unknown as PageGlobals;
      return Boolean(g.__TEST_BOARD__) && Boolean(g.__ctTest);
    },
    { timeout: 10000 },
  );
}

async function runPaletteAction(page: Page, search: string, label: RegExp) {
  await page.click('button[aria-label="Open command palette"]');
  await expect(
    page.locator('input[placeholder*="Search"]').first(),
  ).toBeVisible({ timeout: 2000 });
  await page.keyboard.type(search);
  await page
    .locator('.command-palette-label')
    .filter({ hasText: label })
    .click();
}

async function clickAndSettle(page: Page, pt: { x: number; y: number }) {
  await page.evaluate(async (p) => {
    const g = globalThis as unknown as PageGlobals;
    g.__ctTest!.click(p);
    await g.__TEST_BOARD__!.waitForSelectionSettled();
  }, pt);
}

function findZone(page: Page) {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    for (const [id, obj] of store.getAllObjects()) {
      if (obj._kind === 'zone') {
        return { id, pos: obj._pos, meta: obj._meta ?? {} };
      }
    }
    return null;
  });
}

test.describe('Discard Zone — rename', () => {
  test('Rename… updates _meta.label via the dialog', async ({
    page,
  }, testInfo) => {
    const tableId = `discard-rename-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await waitForReady(page);

    await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject('e2e-rename-stack', {
        _kind: 'stack',
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: [{ code: 'e2e-rename-card' }],
        _faceUp: false,
      });
    });

    // Create the discard zone for the selected stack
    await clickAndSettle(page, { x: 0, y: 0 });
    await runPaletteAction(page, 'discard zone', /Create Discard Zone/i);

    await expect
      .poll(async () => (await findZone(page))?.meta.label)
      .toBe('Discard');
    const zone = (await findZone(page))!;

    // Select the zone (click inside its rect) and open the rename dialog
    await clickAndSettle(page, { x: zone.pos.x, y: zone.pos.y });
    await runPaletteAction(page, 'rename', /Rename/i);

    const input = page.getByTestId('rename-zone-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Discard');

    // Wait for the palette to fully unmount (its Dialog restores focus to the
    // trigger button on unmount), then type with real keyboard events so a
    // missing focus on the rename input fails the test.
    await expect(page.locator('.command-palette-panel')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Encounter Discard');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('rename-zone-panel')).toBeHidden();
    await expect
      .poll(async () => (await findZone(page))?.meta.label)
      .toBe('Encounter Discard');
    expect((await findZone(page))?.meta.isDiscardZone).toBe(true);

    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });
  });
});
