/**
 * Clear actions for tokens, statuses and modifiers (ct-erq.1).
 *
 * Four actions registered by the testgame plugin, all working on any
 * selection size: clear-tokens, clear-statuses, clear-modifiers, and
 * clear-attachments (Shift+0). This is the only witness of plugin registration + canvas
 * multi-select + keyboard + command palette + context menu + store together.
 */

import type { Page } from '@playwright/test';
import { test, expect, skipNextAutoClear } from './_fixtures';

interface Attachments {
  tokens?: Record<string, number>;
  status?: Record<string, number>;
  modifiers?: Record<string, number>;
  icons?: string[];
}

interface StackMeta {
  attachments?: Attachments;
  note?: string;
}

interface ClearTestStore {
  metadata: { set: (key: string, value: unknown) => void };
  setObject: (id: string, obj: unknown) => void;
  getObject: (id: string) => { _meta?: StackMeta } | undefined;
  getAllObjects: () => Map<string, { _selectedBy?: string | null }>;
  waitForReady: () => Promise<void>;
  getGameAssets: () => unknown;
}

interface ClearCtTest {
  click: (
    pt: { x: number; y: number },
    opts?: { modifiers?: { metaKey?: boolean } },
  ) => void;
}

interface ClearGlobals {
  __TEST_STORE__?: ClearTestStore;
  __ctTest?: ClearCtTest;
}

const STACK_A = 'clear-stack-a';
const STACK_B = 'clear-stack-b';
const STACK_BARE = 'clear-stack-bare';

const POS_A = { x: 0, y: 0 };
const POS_B = { x: 300, y: 0 };

const SEED_A: StackMeta = {
  attachments: {
    tokens: { damage: 14 },
    status: { stunned: 1 },
    modifiers: { ATK: 2 },
    icons: ['guard'],
  },
  note: 'keep-me',
};
const SEED_B: StackMeta = {
  attachments: {
    tokens: { damage: 3 },
    status: { stunned: 1 },
    modifiers: { ATK: -1 },
  },
};

const CLEAR_LABELS = [
  'Clear All Tokens',
  'Clear All Statuses',
  'Clear All Modifiers',
  'Clear Tokens, Statuses & Modifiers',
];

async function bindTestgameTable(page: Page, tableId: string): Promise<void> {
  await page.goto(`/table/${tableId}`);
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as ClearGlobals).__TEST_STORE__),
  );
  await page.evaluate(async () => {
    const store = (globalThis as unknown as ClearGlobals).__TEST_STORE__;
    await store?.waitForReady();
    store?.metadata.set('pluginId', 'testgame');
  });
  skipNextAutoClear(page);
  await page.goto(`/table/${tableId}`);
  await page.waitForFunction(
    () => {
      const g = globalThis as unknown as ClearGlobals;
      return g.__TEST_STORE__?.getGameAssets() != null && Boolean(g.__ctTest);
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('canvas').first().waitFor({ timeout: 10_000 });
}

async function seedStack(
  page: Page,
  id: string,
  pos: { x: number; y: number },
  meta: StackMeta,
  sortKey: string,
): Promise<void> {
  await page.evaluate(
    ({ id, pos, meta, sortKey }) => {
      (globalThis as unknown as ClearGlobals).__TEST_STORE__!.setObject(id, {
        _kind: 'stack',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: sortKey,
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: meta,
        _cards: [{ code: `${id}-card` }],
        _faceUp: true,
      });
    },
    { id, pos, meta, sortKey },
  );
}

async function selectStacks(
  page: Page,
  points: Array<{ x: number; y: number }>,
): Promise<void> {
  // The /table route does not expose __TEST_BOARD__ (debug UI off), so settle
  // on the store. Freshly seeded stacks reach the renderer asynchronously and
  // a click that lands before then selects nothing, so re-click only while the
  // expected selection count has not been reached.
  const selectedCount = () =>
    page.evaluate(
      () =>
        Array.from(
          (globalThis as unknown as ClearGlobals)
            .__TEST_STORE__!.getAllObjects()
            .values(),
        ).filter((o) => o._selectedBy).length,
    );

  for (let i = 0; i < points.length; i++) {
    await expect(async () => {
      if ((await selectedCount()) < i + 1) {
        await page.evaluate(
          ({ pt, additive }) => {
            (globalThis as unknown as ClearGlobals).__ctTest!.click(
              pt,
              additive ? { modifiers: { metaKey: true } } : undefined,
            );
          },
          { pt: points[i], additive: i > 0 },
        );
      }
      await page.waitForTimeout(150);
      expect(await selectedCount()).toBe(i + 1);
    }).toPass({ timeout: 10_000 });
  }
}

async function seedAndSelectAandB(page: Page, tableId: string): Promise<void> {
  await bindTestgameTable(page, tableId);
  await seedStack(page, STACK_A, POS_A, SEED_A, '000001');
  await seedStack(page, STACK_B, POS_B, SEED_B, '000002');
  await selectStacks(page, [POS_A, POS_B]);
}

async function readMeta(
  page: Page,
  id: string,
): Promise<StackMeta | undefined> {
  return page.evaluate(
    (id) =>
      (globalThis as unknown as ClearGlobals).__TEST_STORE__!.getObject(id)
        ?._meta,
    id,
  );
}

async function readAttachments(
  page: Page,
  id: string,
): Promise<Attachments | undefined> {
  return (await readMeta(page, id))?.attachments;
}

async function openCommandPalette(page: Page): Promise<void> {
  await page.click('button[aria-label="Open command palette"]');
  await expect(
    page.locator('input[placeholder*="Search"]').first(),
  ).toBeVisible({ timeout: 2_000 });
}

function paletteOption(page: Page, label: string) {
  return page.locator('.command-palette-option-content').filter({
    has: page.locator('.command-palette-label', { hasText: label }),
  });
}

async function runFromPalette(page: Page, label: string): Promise<void> {
  await openCommandPalette(page);
  await page.locator('input[placeholder*="Search"]').first().fill(label);
  await page
    .locator('.command-palette-label')
    .filter({ hasText: label })
    .first()
    .click();
  await expect(page.locator('input[placeholder*="Search"]')).toHaveCount(0);
}

async function openContextMenuAt(
  page: Page,
  world: { x: number; y: number },
): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.click(
    box.x + box.width / 2 + world.x,
    box.y + box.height / 2 + world.y,
    { button: 'right' },
  );
  await expect(page.locator('.context-menu')).toBeVisible({ timeout: 5_000 });
}

test.describe('Clear tokens, statuses and modifiers', () => {
  test('a. Shift+0 clears tokens, statuses and modifiers on both selected stacks and keeps icons and other _meta', async ({
    page,
  }, testInfo) => {
    await seedAndSelectAandB(
      page,
      `clear-a-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );
    expect((await readAttachments(page, STACK_A))?.tokens).toEqual({
      damage: 14,
    });

    await page.keyboard.press('Shift+Digit0');

    await expect
      .poll(async () => (await readAttachments(page, STACK_A))?.tokens)
      .toBeUndefined();
    expect(await readAttachments(page, STACK_A)).toEqual({ icons: ['guard'] });
    expect((await readMeta(page, STACK_A))?.note).toBe('keep-me');
    const b = await readAttachments(page, STACK_B);
    expect(b?.tokens).toBeUndefined();
    expect(b?.status).toBeUndefined();
    expect(b?.modifiers).toBeUndefined();
  });

  test('k. Clear All Tokens from the palette removes only tokens', async ({
    page,
  }, testInfo) => {
    await seedAndSelectAandB(
      page,
      `clear-k-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );

    await runFromPalette(page, 'Clear All Tokens');

    await expect
      .poll(async () => (await readAttachments(page, STACK_A))?.tokens)
      .toBeUndefined();
    expect((await readAttachments(page, STACK_B))?.tokens).toBeUndefined();
    expect(await readAttachments(page, STACK_A)).toEqual({
      status: { stunned: 1 },
      modifiers: { ATK: 2 },
      icons: ['guard'],
    });
    expect(await readAttachments(page, STACK_B)).toEqual({
      status: { stunned: 1 },
      modifiers: { ATK: -1 },
    });
  });

  test('b. Clear All Statuses from the palette removes only statuses', async ({
    page,
  }, testInfo) => {
    await seedAndSelectAandB(
      page,
      `clear-b-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );

    await runFromPalette(page, 'Clear All Statuses');

    await expect
      .poll(async () => (await readAttachments(page, STACK_A))?.status)
      .toBeUndefined();
    expect((await readAttachments(page, STACK_B))?.status).toBeUndefined();
    expect(await readAttachments(page, STACK_A)).toEqual({
      tokens: { damage: 14 },
      modifiers: { ATK: 2 },
      icons: ['guard'],
    });
    expect(await readAttachments(page, STACK_B)).toEqual({
      tokens: { damage: 3 },
      modifiers: { ATK: -1 },
    });
  });

  test('c. Clear All Modifiers from the palette removes only modifiers', async ({
    page,
  }, testInfo) => {
    await seedAndSelectAandB(
      page,
      `clear-c-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );

    await runFromPalette(page, 'Clear All Modifiers');

    await expect
      .poll(async () => (await readAttachments(page, STACK_A))?.modifiers)
      .toBeUndefined();
    expect((await readAttachments(page, STACK_B))?.modifiers).toBeUndefined();
    expect(await readAttachments(page, STACK_A)).toEqual({
      tokens: { damage: 14 },
      status: { stunned: 1 },
      icons: ['guard'],
    });
    expect(await readAttachments(page, STACK_B)).toEqual({
      tokens: { damage: 3 },
      status: { stunned: 1 },
    });
  });

  test('d. Clear Tokens, Statuses & Modifiers removes all three and keeps icons and other _meta', async ({
    page,
  }, testInfo) => {
    await seedAndSelectAandB(
      page,
      `clear-d-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );

    await runFromPalette(page, 'Clear Tokens, Statuses & Modifiers');

    await expect
      .poll(async () => (await readAttachments(page, STACK_B))?.tokens)
      .toBeUndefined();
    expect(await readAttachments(page, STACK_A)).toEqual({ icons: ['guard'] });
    expect((await readMeta(page, STACK_A))?.note).toBe('keep-me');
    // B had only tokens/status/modifiers: nothing remains to assert on
    // semantically, so accept either an absent or an empty attachments value.
    const b = await readAttachments(page, STACK_B);
    expect(b?.tokens).toBeUndefined();
    expect(b?.status).toBeUndefined();
    expect(b?.modifiers).toBeUndefined();
  });

  test('e. the palette lists all four clear actions, enabled, with Shift+0 on Clear Tokens, Statuses & Modifiers only', async ({
    page,
  }, testInfo) => {
    await seedAndSelectAandB(
      page,
      `clear-e-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );

    await openCommandPalette(page);
    for (const label of CLEAR_LABELS) {
      const option = paletteOption(page, label);
      await expect(option).toHaveCount(1);
      await expect(option).not.toHaveClass(/disabled/);
    }
    await expect(
      paletteOption(page, 'Clear Tokens, Statuses & Modifiers').locator(
        '.command-palette-shortcut',
      ),
    ).toHaveText(/0/);
    for (const label of [
      'Clear All Tokens',
      'Clear All Statuses',
      'Clear All Modifiers',
    ]) {
      await expect(
        paletteOption(page, label).locator('.command-palette-shortcut'),
      ).toHaveCount(0);
    }
  });

  test('f. a single selection clears only that stack', async ({
    page,
  }, testInfo) => {
    await bindTestgameTable(
      page,
      `clear-f-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );
    await seedStack(page, STACK_A, POS_A, SEED_A, '000001');
    await seedStack(page, STACK_B, POS_B, SEED_B, '000002');
    await selectStacks(page, [POS_A]);

    await page.keyboard.press('Shift+Digit0');

    await expect
      .poll(async () => (await readAttachments(page, STACK_A))?.tokens)
      .toBeUndefined();
    expect(await readAttachments(page, STACK_A)).toEqual({ icons: ['guard'] });
    expect(await readAttachments(page, STACK_B)).toEqual(SEED_B.attachments);
  });

  test('g. with nothing clearable selected, Shift+0 is a no-op and the clear actions are disabled in the palette and absent from the context menu', async ({
    page,
  }, testInfo) => {
    await bindTestgameTable(
      page,
      `clear-g-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );
    const bareMeta: StackMeta = {
      attachments: { modifiers: { ATK: 0 }, icons: ['guard'] },
      note: 'bare',
    };
    await seedStack(page, STACK_BARE, POS_A, bareMeta, '000001');
    await selectStacks(page, [POS_A]);

    await page.keyboard.press('Shift+Digit0');
    // Let any (incorrectly) dispatched action land before asserting no change.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 300);
        }),
    );
    expect(await readMeta(page, STACK_BARE)).toEqual(bareMeta);

    await openCommandPalette(page);
    for (const label of CLEAR_LABELS) {
      const option = paletteOption(page, label);
      await expect(option).toHaveCount(1);
      await expect(option).toHaveClass(/disabled/);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('input[placeholder*="Search"]')).toHaveCount(0);

    await openContextMenuAt(page, POS_A);
    await expect(page.locator('.context-menu-label').first()).toBeVisible();
    for (const label of CLEAR_LABELS) {
      await expect(
        page.locator('.context-menu-label').filter({ hasText: label }),
      ).toHaveCount(0);
    }
  });

  test('h. a mixed selection where only one stack has attachments clears just that stack without error', async ({
    page,
  }, testInfo) => {
    await bindTestgameTable(
      page,
      `clear-h-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );
    const bareMeta: StackMeta = { note: 'bare' };
    await seedStack(page, STACK_A, POS_A, SEED_A, '000001');
    await seedStack(page, STACK_BARE, POS_B, bareMeta, '000002');
    await selectStacks(page, [POS_A, POS_B]);

    await page.keyboard.press('Shift+Digit0');

    await expect
      .poll(async () => (await readAttachments(page, STACK_A))?.tokens)
      .toBeUndefined();
    expect(await readAttachments(page, STACK_A)).toEqual({ icons: ['guard'] });
    expect(await readMeta(page, STACK_BARE)).toEqual(bareMeta);
  });

  test('i. the context menu on a multi-selection lists the clear actions', async ({
    page,
  }, testInfo) => {
    await seedAndSelectAandB(
      page,
      `clear-i-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`,
    );

    await openContextMenuAt(page, POS_A);
    for (const label of CLEAR_LABELS) {
      await expect(
        page.locator('.context-menu-label').filter({ hasText: label }),
      ).toHaveCount(1);
    }
  });

  test('j. the clear actions are gone after client-side navigation to a table with no plugin', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '-');
    await bindTestgameTable(page, `clear-j-${suffix}`);

    await openCommandPalette(page);
    await expect(paletteOption(page, 'Clear All Tokens')).toHaveCount(1);
    await page.keyboard.press('Escape');

    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/dev/table/clear-j-other-${suffix}`);
    await page.waitForURL(`**/dev/table/clear-j-other-${suffix}`);
    await page.locator('canvas').first().waitFor({ timeout: 10_000 });

    await openCommandPalette(page);
    await expect(paletteOption(page, 'Close Table')).toHaveCount(1);
    for (const label of CLEAR_LABELS) {
      await expect(paletteOption(page, label)).toHaveCount(0);
    }
  });
});
