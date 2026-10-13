/**
 * E2E tests for token-preserving stack merges (ct-9yd.3).
 *
 * Dropping a stack onto another stack keeps the dragged side's tokens and
 * statuses. When both sides carry attachments the drop is held and a dialog
 * asks which to keep. The dialog cannot be dismissed. Dropping onto a discard
 * pile never prompts and the pile gains no attachments.
 *
 * Strategy:
 * - Reset to the test scene (stack0: 1 card at (-300,-200), stack1: 2 cards
 *   at (-220,-200)) and seed tokens straight into the store.
 * - Shift-drag stack0 onto stack1 with real pointer input.
 * - Assert on the store through __TEST_STORE__.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface Point {
  x: number;
  y: number;
}

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _cards?: { code: string; homeZone?: string }[];
  _containerId?: string | null;
  _meta?: {
    attachments?: {
      tokens?: Record<string, number>;
      status?: Record<string, number>;
      modifiers?: Record<string, number>;
    };
  };
}

interface YMapLike {
  get: (k: string) => unknown;
  set: (k: string, v: unknown) => void;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, StoreObject>;
  getObjectYMap: (id: string) => YMapLike | undefined;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __TEST_BOARD__?: { waitForRenderer: () => Promise<void> };
}

type Tokens = Record<string, number>;

interface StackIds {
  source: string;
  target: string;
  sourceCards: number;
  targetCards: number;
}

interface StackSnapshot {
  exists: boolean;
  cardCount: number;
  tokens: Tokens | null;
}

const PANEL = 'merge-attachments-panel';

async function waitForRenderer(page: Page) {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as PageGlobals
    ).__TEST_BOARD__!.waitForRenderer();
  });
}

/** Source = leftmost scene stack (1 card), target = the one right of it (2 cards). */
async function getSceneStacks(page: Page): Promise<StackIds> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    const stacks = Array.from(store.getAllObjects().entries())
      .filter(([, obj]) => obj._kind === 'stack')
      .sort((a, b) => a[1]._pos.x - b[1]._pos.x);
    const [source, target] = stacks;
    return {
      source: String(source[0]),
      target: String(target[0]),
      sourceCards: source[1]._cards?.length ?? 0,
      targetCards: target[1]._cards?.length ?? 0,
    };
  });
}

async function seedTokens(page: Page, id: string, tokens: Tokens) {
  await page.evaluate(
    ({ id, tokens }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const yMap = store.getObjectYMap(id)!;
      const meta = (yMap.get('_meta') ?? {}) as Record<string, unknown>;
      yMap.set('_meta', { ...meta, attachments: { tokens } });
    },
    { id, tokens },
  );
  await waitForRenderer(page);
}

async function snapshot(page: Page, id: string): Promise<StackSnapshot> {
  return page.evaluate((id) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    const yMap = store.getObjectYMap(id);
    if (!yMap) return { exists: false, cardCount: 0, tokens: null };
    const cards = yMap.get('_cards') as unknown[] | undefined;
    const meta = yMap.get('_meta') as StoreObject['_meta'] | undefined;
    return {
      exists: true,
      cardCount: cards?.length ?? 0,
      tokens: meta?.attachments?.tokens ?? null,
    };
  }, id);
}

async function worldToViewport(page: Page, world: Point): Promise<Point> {
  return page.evaluate((world) => {
    const canvas = document.querySelector('canvas')!;
    const box = canvas.getBoundingClientRect();
    return {
      x: box.x + canvas.clientWidth / 2 + world.x,
      y: box.y + canvas.clientHeight / 2 + world.y,
    };
  }, world);
}

async function objectViewportPos(page: Page, id: string): Promise<Point> {
  const world = await page.evaluate((id) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return store.getAllObjects().get(id)!._pos;
  }, id);
  return worldToViewport(page, world);
}

/** Select `fromId`, then Shift-drag it onto `toId` with real pointer input. */
async function shiftDrag(page: Page, fromId: string, toId: string) {
  const from = await objectViewportPos(page, fromId);
  const to = await objectViewportPos(page, toId);

  await page.mouse.click(from.x, from.y);
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __TEST_BOARD__: { waitForSelectionSettled: () => Promise<void> };
      }
    ).__TEST_BOARD__.waitForSelectionSettled();
  });

  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await waitForRenderer(page);
}

test.describe('Stack merge keeps attachments', () => {
  let ids: StackIds;

  test.beforeEach(async ({ page }, testInfo) => {
    const tableId = `merge-att-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);

    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );
    await expect(page.getByTestId('board-canvas')).toBeVisible({
      timeout: 5000,
    });
    await page.waitForFunction(
      () => (globalThis as unknown as PageGlobals).__TEST_BOARD__ !== undefined,
      { timeout: 5000 },
    );

    await page.click('button:has-text("Reset to Test Scene")');
    await expect(page.locator('text=Objects: 15')).toBeVisible({
      timeout: 5000,
    });
    await waitForRenderer(page);

    ids = await getSceneStacks(page);
    expect(ids.sourceCards).toBe(1);
    expect(ids.targetCards).toBe(2);
  });

  test('dragged card has tokens, target has none: tokens move over, no dialog', async ({
    page,
  }) => {
    await seedTokens(page, ids.source, { damage: 3 });

    await shiftDrag(page, ids.source, ids.target);

    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    expect((await snapshot(page, ids.source)).exists).toBe(false);
    const target = await snapshot(page, ids.target);
    expect(target.tokens).toEqual({ damage: 3 });
    expect(target.cardCount).toBe(ids.sourceCards + ids.targetCards);
  });

  test('target has tokens, dragged card has none: tokens stay, no dialog', async ({
    page,
  }) => {
    await seedTokens(page, ids.target, { threat: 2 });

    await shiftDrag(page, ids.source, ids.target);

    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    expect((await snapshot(page, ids.source)).exists).toBe(false);
    const target = await snapshot(page, ids.target);
    expect(target.tokens).toEqual({ threat: 2 });
    expect(target.cardCount).toBe(ids.sourceCards + ids.targetCards);
  });

  test('both have tokens: drop is held until Combine both is chosen', async ({
    page,
  }) => {
    await seedTokens(page, ids.source, { damage: 3 });
    await seedTokens(page, ids.target, { damage: 1, threat: 2 });

    await shiftDrag(page, ids.source, ids.target);

    await expect(page.getByTestId(PANEL)).toBeVisible();
    // Held: nothing has merged yet
    expect((await snapshot(page, ids.source)).exists).toBe(true);
    const held = await snapshot(page, ids.target);
    expect(held.cardCount).toBe(ids.targetCards);
    expect(held.tokens).toEqual({ damage: 1, threat: 2 });

    await page.getByTestId('merge-attachments-merge').click();
    await waitForRenderer(page);

    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    expect((await snapshot(page, ids.source)).exists).toBe(false);
    const target = await snapshot(page, ids.target);
    expect(target.tokens).toEqual({ damage: 4, threat: 2 });
    expect(target.cardCount).toBe(ids.sourceCards + ids.targetCards);
  });

  test("both have tokens: Keep the stack's keeps the target's tokens", async ({
    page,
  }) => {
    await seedTokens(page, ids.source, { damage: 3 });
    await seedTokens(page, ids.target, { damage: 1, threat: 2 });

    await shiftDrag(page, ids.source, ids.target);
    await expect(page.getByTestId(PANEL)).toBeVisible();

    await page.getByTestId('merge-attachments-target').click();
    await waitForRenderer(page);

    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    expect((await snapshot(page, ids.source)).exists).toBe(false);
    const target = await snapshot(page, ids.target);
    expect(target.tokens).toEqual({ damage: 1, threat: 2 });
    expect(target.cardCount).toBe(ids.sourceCards + ids.targetCards);
  });

  test("both have tokens: Keep the dragged card's keeps the source's tokens", async ({
    page,
  }) => {
    await seedTokens(page, ids.source, { damage: 3 });
    await seedTokens(page, ids.target, { damage: 1, threat: 2 });

    await shiftDrag(page, ids.source, ids.target);
    await expect(page.getByTestId(PANEL)).toBeVisible();

    await page.getByTestId('merge-attachments-source').click();
    await waitForRenderer(page);

    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    expect((await snapshot(page, ids.source)).exists).toBe(false);
    const target = await snapshot(page, ids.target);
    expect(target.tokens).toEqual({ damage: 3 });
    expect(target.cardCount).toBe(ids.sourceCards + ids.targetCards);
  });

  test('the dialog cannot be dismissed by Escape, backdrop click, or a close button', async ({
    page,
  }) => {
    await seedTokens(page, ids.source, { damage: 3 });
    await seedTokens(page, ids.target, { damage: 1, threat: 2 });

    await shiftDrag(page, ids.source, ids.target);
    const panel = page.getByTestId(PANEL);
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();

    // Top-left corner of the viewport is on the backdrop, outside the panel
    await page.mouse.click(2, 2);
    await expect(panel).toBeVisible();

    // The only controls are the three answers
    await expect(panel.getByRole('button')).toHaveCount(3);
    await expect(panel.getByRole('button', { name: /close/i })).toHaveCount(0);

    // Nothing changed while the dialog was open
    const source = await snapshot(page, ids.source);
    expect(source.exists).toBe(true);
    expect(source.tokens).toEqual({ damage: 3 });
    const target = await snapshot(page, ids.target);
    expect(target.tokens).toEqual({ damage: 1, threat: 2 });
    expect(target.cardCount).toBe(ids.targetCards);

    // Answer it so no dialog is left open
    await page.getByTestId('merge-attachments-merge').click();
    await waitForRenderer(page);
    await expect(panel).toHaveCount(0);
    expect((await snapshot(page, ids.source)).exists).toBe(false);
    expect((await snapshot(page, ids.target)).tokens).toEqual({
      damage: 4,
      threat: 2,
    });
  });

  test('table shortcuts do not fire while the dialog is open; Enter still chooses', async ({
    page,
  }) => {
    // A discard zone plus a home-zone tag make X (Discard) destructive
    await page.evaluate((sourceId) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject('e2e-zone', {
        _kind: 'zone',
        _pos: { x: 420, y: 100, r: 0 },
        _sortKey: '900001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
      const yMap = store.getObjectYMap(sourceId)!;
      const cards = yMap.get('_cards') as { code: string }[];
      yMap.set(
        '_cards',
        cards.map((c) => ({ ...c, homeZone: 'e2e-zone' })),
      );
    }, ids.source);
    await waitForRenderer(page);
    await seedTokens(page, ids.source, { damage: 3 });
    await seedTokens(page, ids.target, { damage: 1, threat: 2 });

    await shiftDrag(page, ids.source, ids.target);
    const panel = page.getByTestId(PANEL);
    await expect(panel).toBeVisible();

    await page.keyboard.press('Delete');
    await page.keyboard.press('x');
    await waitForRenderer(page);

    await expect(panel).toBeVisible();
    const source = await snapshot(page, ids.source);
    expect(source.exists).toBe(true);
    expect(source.tokens).toEqual({ damage: 3 });
    const target = await snapshot(page, ids.target);
    expect(target.exists).toBe(true);
    expect(target.tokens).toEqual({ damage: 1, threat: 2 });
    expect(target.cardCount).toBe(ids.targetCards);

    // Focus is on Combine both, so Enter chooses it
    await page.keyboard.press('Enter');
    await waitForRenderer(page);

    await expect(panel).toHaveCount(0);
    expect((await snapshot(page, ids.source)).exists).toBe(false);
    const merged = await snapshot(page, ids.target);
    expect(merged.tokens).toEqual({ damage: 4, threat: 2 });
    expect(merged.cardCount).toBe(ids.sourceCards + ids.targetCards);
  });

  test('drop onto a discard pile: no dialog and the pile gains no attachments', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject('e2e-zone', {
        _kind: 'zone',
        _pos: { x: 300, y: 100, r: 0 },
        _sortKey: '900001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
      store.setObject('e2e-pile', {
        _kind: 'stack',
        _pos: { x: 300, y: 100, r: 0 },
        _sortKey: '900002',
        _locked: false,
        _selectedBy: null,
        _containerId: 'e2e-zone',
        _meta: {},
        _cards: [{ code: 'e2e-pile-card' }],
        _faceUp: true,
      });
      store.setObject('e2e-source', {
        _kind: 'stack',
        _pos: { x: 0, y: 100, r: 0 },
        _sortKey: '900003',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {
          attachments: {
            tokens: { damage: 3 },
            status: { stunned: 1 },
            modifiers: { ATK: 1 },
          },
        },
        _cards: [{ code: 'e2e-source-card' }],
        _faceUp: true,
      });
    });
    await waitForRenderer(page);

    await shiftDrag(page, 'e2e-source', 'e2e-pile');

    await expect(page.getByTestId(PANEL)).toHaveCount(0);
    const result = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const pile = store.getObjectYMap('e2e-pile');
      return {
        sourceExists: store.getObjectYMap('e2e-source') !== undefined,
        cardCount: (pile?.get('_cards') as unknown[] | undefined)?.length ?? 0,
        containerId: pile?.get('_containerId'),
        attachments: (pile?.get('_meta') as StoreObject['_meta'] | undefined)
          ?.attachments,
      };
    });
    expect(result.sourceExists).toBe(false);
    expect(result.cardCount).toBe(2);
    expect(result.containerId).toBe('e2e-zone');
    expect(result.attachments).toBeUndefined();
  });
});
