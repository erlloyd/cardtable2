/**
 * Set Tokens action (ct-o3r.1): one "Set Tokens…" action opens a modal with a
 * number field per manifest token type and writes the counts directly. Witness
 * for plugin registration + canvas selection + command palette + context menu +
 * modal + store together. The rendered count is store-driven and not read here
 * (no __TEST_BOARD__ on /table).
 */

import type { Page } from '@playwright/test';
import { test, expect, skipNextAutoClear } from './_fixtures';

interface Attachments {
  tokens?: Record<string, number>;
  status?: Record<string, number>;
}

interface StackMeta {
  attachments?: Attachments;
  note?: string;
}

interface SetTokensTestStore {
  metadata: { set: (key: string, value: unknown) => void };
  setObject: (id: string, obj: unknown) => void;
  getObject: (id: string) => { _meta?: StackMeta } | undefined;
  getAllObjects: () => Map<string, { _selectedBy?: string | null }>;
  waitForReady: () => Promise<void>;
  getGameAssets: () => unknown;
}

interface SetTokensCtTest {
  click: (
    pt: { x: number; y: number },
    opts?: { modifiers?: { metaKey?: boolean } },
  ) => void;
}

interface SetTokensGlobals {
  __TEST_STORE__?: SetTokensTestStore;
  __ctTest?: SetTokensCtTest;
}

const STACK_S = 'set-tokens-stack-s';
const STACK_T = 'set-tokens-stack-t';

const POS_S = { x: 0, y: 0 };
const POS_T = { x: 300, y: 0 };

const LABEL = 'Set Tokens…';

async function bindTestgameTable(page: Page, tableId: string): Promise<void> {
  await page.goto(`/table/${tableId}`);
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as SetTokensGlobals).__TEST_STORE__),
  );
  await page.evaluate(async () => {
    const store = (globalThis as unknown as SetTokensGlobals).__TEST_STORE__;
    await store?.waitForReady();
    store?.metadata.set('pluginId', 'testgame');
  });
  skipNextAutoClear(page);
  await page.goto(`/table/${tableId}`);
  await page.waitForFunction(
    () => {
      const g = globalThis as unknown as SetTokensGlobals;
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
      (globalThis as unknown as SetTokensGlobals).__TEST_STORE__!.setObject(
        id,
        {
          _kind: 'stack',
          _pos: { x: pos.x, y: pos.y, r: 0 },
          _sortKey: sortKey,
          _locked: false,
          _selectedBy: null,
          _containerId: null,
          _meta: meta,
          _cards: [{ code: `${id}-card` }],
          _faceUp: true,
        },
      );
    },
    { id, pos, meta, sortKey },
  );
}

async function selectStacks(
  page: Page,
  points: Array<{ x: number; y: number }>,
): Promise<void> {
  // Freshly seeded stacks reach the renderer asynchronously and a click that
  // lands before then selects nothing, so re-click only while the expected
  // selection count has not been reached.
  const selectedCount = () =>
    page.evaluate(
      () =>
        Array.from(
          (globalThis as unknown as SetTokensGlobals)
            .__TEST_STORE__!.getAllObjects()
            .values(),
        ).filter((o) => o._selectedBy).length,
    );

  for (let i = 0; i < points.length; i++) {
    await expect(async () => {
      if ((await selectedCount()) < i + 1) {
        await page.evaluate(
          ({ pt, additive }) => {
            (globalThis as unknown as SetTokensGlobals).__ctTest!.click(
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

async function readMeta(
  page: Page,
  id: string,
): Promise<StackMeta | undefined> {
  return page.evaluate(
    (id) =>
      (globalThis as unknown as SetTokensGlobals).__TEST_STORE__!.getObject(id)
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

function tableId(prefix: string, testId: string): string {
  return `${prefix}-${testId.replace(/[^a-z0-9]/gi, '-')}`;
}

test.describe('Set Tokens', () => {
  test('a. the palette opens a prefilled, focused modal and Enter writes the count and keeps other attachments', async ({
    page,
  }, testInfo) => {
    await bindTestgameTable(page, tableId('set-tokens-a', testInfo.testId));
    await seedStack(
      page,
      STACK_S,
      POS_S,
      {
        attachments: { tokens: { damage: 2 }, status: { stunned: 1 } },
        note: 'keep',
      },
      '000001',
    );
    await selectStacks(page, [POS_S]);

    await runFromPalette(page, LABEL);

    const input = page.getByTestId('set-tokens-input-damage');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('2');

    await input.fill('7');
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => (await readAttachments(page, STACK_S))?.tokens)
      .toEqual({ damage: 7 });
    expect((await readAttachments(page, STACK_S))?.status).toEqual({
      stunned: 1,
    });
    expect((await readMeta(page, STACK_S))?.note).toBe('keep');
    await expect(page.getByTestId('set-tokens-panel')).toHaveCount(0);
  });

  test('b. the context menu sets a count to zero, removing the token entry', async ({
    page,
  }, testInfo) => {
    await bindTestgameTable(page, tableId('set-tokens-b', testInfo.testId));
    await seedStack(
      page,
      STACK_S,
      POS_S,
      { attachments: { tokens: { damage: 7 } } },
      '000001',
    );
    await selectStacks(page, [POS_S]);

    await openContextMenuAt(page, POS_S);
    await page
      .locator('.context-menu .context-menu-label')
      .filter({ hasText: LABEL })
      .click();

    const input = page.getByTestId('set-tokens-input-damage');
    await expect(input).toHaveValue('7');
    await input.fill('0');
    await page.getByTestId('set-tokens-submit').click();

    await expect
      .poll(async () => (await readAttachments(page, STACK_S))?.tokens)
      .toBeUndefined();
    await expect(page.getByTestId('set-tokens-panel')).toHaveCount(0);
  });

  test('c. the action is disabled in the palette for a multi-selection', async ({
    page,
  }, testInfo) => {
    await bindTestgameTable(page, tableId('set-tokens-c', testInfo.testId));
    await seedStack(page, STACK_S, POS_S, {}, '000001');
    await seedStack(page, STACK_T, POS_T, {}, '000002');
    await selectStacks(page, [POS_S, POS_T]);

    await openCommandPalette(page);
    const option = paletteOption(page, LABEL);
    await expect(option).toHaveCount(1);
    await expect(option).toHaveClass(/disabled/);
  });

  test('d. Escape cancels without writing', async ({ page }, testInfo) => {
    await bindTestgameTable(page, tableId('set-tokens-d', testInfo.testId));
    await seedStack(
      page,
      STACK_S,
      POS_S,
      { attachments: { tokens: { damage: 4 } } },
      '000001',
    );
    await selectStacks(page, [POS_S]);

    await runFromPalette(page, LABEL);
    const input = page.getByTestId('set-tokens-input-damage');
    await expect(input).toBeFocused();
    await input.fill('9');
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('set-tokens-panel')).toHaveCount(0);
    expect((await readAttachments(page, STACK_S))?.tokens).toEqual({
      damage: 4,
    });
  });
});
