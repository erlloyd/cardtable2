/**
 * E2E tests for the discard zone loop: create zone, discard card, verify routing.
 *
 * Covers ct-ecl acceptance criteria:
 * - First discard into empty zone creates pile face-up with _containerId === zoneId
 * - Second discard merges onto existing pile (pile grows, stays face-up)
 * - Member card sitting in a foreign stack routes to home zone (proves per-card routing)
 * - A card with no home zone raises a visible toast and moves nothing
 *
 * Strategy:
 * - Seed stacks via __TEST_STORE__.setObject (deterministic ids)
 * - Seed home-zone tags on the card entries ({ code, homeZone })
 * - Select a stack via __ctTest.click (canvas pointer event)
 * - Trigger 'Discard' action via keyboard shortcut 'X'
 * - Assert via __TEST_STORE__ that card landed face-up in the zone's pile
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getObject: (id: string) => unknown;
  getAllObjects: () => Map<string, StoreObject>;
  getObjectYMap: (id: string) => { get: (k: string) => unknown } | undefined;
  clearAllObjects: () => void;
  waitForReady: () => Promise<void>;
  filterObjects: (
    pred: (yMap: { get: (k: string) => unknown }, id: string) => boolean,
  ) => string[];
}

interface CardEntry {
  code: string;
  homeZone?: string;
}

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _cards?: CardEntry[];
  _faceUp?: boolean;
  _containerId?: string | null;
  _sortKey?: string;
  _locked?: boolean;
  _selectedBy?: string | null;
  _meta?: Record<string, unknown>;
}

interface PageTestBoard {
  waitForRenderer: () => Promise<void>;
  waitForSelectionSettled: () => Promise<void>;
}

interface PageCtTest {
  click: (pt: { x: number; y: number }) => void;
  drag: (
    from: { x: number; y: number },
    to: { x: number; y: number },
    opts?: { steps?: number },
  ) => Promise<void>;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __TEST_BOARD__?: PageTestBoard;
  __ctTest?: PageCtTest;
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

test.describe('Discard Zone — store-level loop', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const tableId = `discard-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await waitForReady(page);
  });

  test('first discard into empty zone creates face-up pile with containerId', async ({
    page,
  }) => {
    // Seed: one stack whose card is tagged with the zone's id
    await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobals;
      const store = g.__TEST_STORE__!;

      store.setObject('e2e-source-stack', {
        _kind: 'stack',
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: [{ code: 'e2e-card-a', homeZone: 'e2e-zone' }],
        _faceUp: false,
      });
      store.setObject('e2e-zone', {
        _kind: 'zone',
        _pos: { x: 420, y: 0, r: 0 },
        _sortKey: '000002',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
    });

    // Select the source stack via canvas click
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.click({ x: 0, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });

    // Trigger 'Discard' action via keyboard shortcut
    await page.keyboard.press('x');
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });

    // Verify: a Stack with _containerId === 'e2e-zone' exists and is face-up
    const result = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const all = store.getAllObjects();
      for (const [, obj] of all) {
        if (
          obj._kind === 'stack' &&
          obj._containerId === 'e2e-zone' &&
          obj._cards?.some((e) => e.code === 'e2e-card-a') &&
          obj._faceUp === true
        ) {
          return { found: true };
        }
      }
      return { found: false };
    });

    expect(result.found).toBe(true);
  });

  test('discard on a card with no home zone shows a toast and moves nothing', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject('e2e-nohome-stack', {
        _kind: 'stack',
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: [{ code: 'e2e-nohome-card' }],
        _faceUp: false,
      });
    });

    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.click({ x: 0, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });

    let dialogSeen = false;
    page.on('dialog', (dialog) => {
      dialogSeen = true;
      void dialog.dismiss();
    });
    await page.keyboard.press('x');

    await expect(page.getByRole('status')).toContainText(
      '1 card has no discard zone',
    );
    expect(dialogSeen).toBe(false);

    const stack = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      return store.getAllObjects().get('e2e-nohome-stack');
    });
    expect(stack?._cards).toEqual([{ code: 'e2e-nohome-card' }]);
    expect(stack?._containerId).toBeNull();
  });

  test('second discard merges onto existing pile', async ({ page }) => {
    await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobals;
      const store = g.__TEST_STORE__!;

      store.setObject('e2e-source-stack2', {
        _kind: 'stack',
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: [
          { code: 'e2e-card-1', homeZone: 'e2e-zone2' },
          { code: 'e2e-card-2', homeZone: 'e2e-zone2' },
        ],
        _faceUp: false,
      });
      store.setObject('e2e-zone2', {
        _kind: 'zone',
        _pos: { x: 420, y: 0, r: 0 },
        _sortKey: '000002',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
    });

    // Discard top card (e2e-card-1)
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.click({ x: 0, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });
    await page.keyboard.press('x');
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });

    // Discard second card (e2e-card-2 is now top)
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.click({ x: 0, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });
    await page.keyboard.press('x');
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });

    const result = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const all = store.getAllObjects();
      const piles: { cardCount: number; faceUp: boolean }[] = [];
      for (const [, obj] of all) {
        if (obj._kind === 'stack' && obj._containerId === 'e2e-zone2') {
          piles.push({
            cardCount: obj._cards?.length ?? 0,
            faceUp: obj._faceUp ?? false,
          });
        }
      }
      return piles;
    });

    // Exactly one pile with both cards merged
    expect(result.length).toBe(1);
    expect(result[0].cardCount).toBe(2);
    expect(result[0].faceUp).toBe(true);
  });

  test('discard acts on the selected stack when an older zone pile holds the same card id', async ({
    page,
  }) => {
    // Regression: discard used to scan stacks by card id and pick the first
    // match (the older pile), instead of the selected stack.
    await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobals;
      const store = g.__TEST_STORE__!;
      const base = {
        _kind: 'stack',
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _meta: {},
        _faceUp: false,
      };

      store.setObject('e2e-dup-zone', {
        _kind: 'zone',
        _pos: { x: 420, y: 0, r: 0 },
        _sortKey: '000000',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
      const tag = (code: string) => ({ code, homeZone: 'e2e-dup-zone' });
      // Older pile created first so it precedes the source in iteration order
      store.setObject('e2e-dup-pile', {
        ...base,
        _pos: { x: 420, y: 0, r: 0 },
        _containerId: 'e2e-dup-zone',
        _cards: [tag('dup-A'), tag('dup-B')],
        _faceUp: true,
      });
      store.setObject('e2e-dup-source', {
        ...base,
        _sortKey: '000002',
        _pos: { x: 0, y: 0, r: 0 },
        _containerId: null,
        _cards: [tag('dup-A'), tag('dup-C')],
      });
    });

    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.click({ x: 0, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });
    await page.keyboard.press('x');
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });

    const result = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const stacks: { id: string; cards: string[] }[] = [];
      for (const [id, obj] of store.getAllObjects()) {
        if (obj._kind === 'stack') {
          stacks.push({ id, cards: (obj._cards ?? []).map((e) => e.code) });
        }
      }
      return stacks;
    });

    const byId = new Map(result.map((s) => [s.id, s.cards]));
    expect(byId.get('e2e-dup-source')).toEqual(['dup-C']);
    expect(byId.get('e2e-dup-pile')).toEqual(['dup-A', 'dup-A', 'dup-B']);
    expect(result.flatMap((s) => s.cards).length).toBe(4);
  });

  test('discard → drag card out → X re-discards (not just flip in place)', async ({
    page,
  }) => {
    // Regression for ct-g69: after a card was discarded and then dragged out of
    // the zone, pressing X a second time must re-route the card back to the
    // zone pile (containerId re-set), not merely set _faceUp=true in place.
    await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobals;
      const store = g.__TEST_STORE__!;

      store.setObject('e2e-redisc-stack', {
        _kind: 'stack',
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: [{ code: 'e2e-redisc-card', homeZone: 'e2e-redisc-zone' }],
        _faceUp: false,
      });
      store.setObject('e2e-redisc-zone', {
        _kind: 'zone',
        _pos: { x: 75, y: 0, r: 0 },
        _sortKey: '000000',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard', width: 71, height: 96 },
      });
    });

    // Step 1: Select the source stack and discard (X)
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.click({ x: 0, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });
    await page.keyboard.press('x');
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });

    // Verify card landed in the zone with containerId set
    const afterFirstDiscard = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const all = store.getAllObjects();
      for (const [, obj] of all) {
        if (
          obj._kind === 'stack' &&
          obj._containerId === 'e2e-redisc-zone' &&
          obj._cards?.some((e) => e.code === 'e2e-redisc-card')
        ) {
          return {
            found: true,
            containerId: obj._containerId,
            faceUp: obj._faceUp,
          };
        }
      }
      return { found: false, containerId: null, faceUp: null };
    });
    expect(afterFirstDiscard.found).toBe(true);
    expect(afterFirstDiscard.containerId).toBe('e2e-redisc-zone');
    expect(afterFirstDiscard.faceUp).toBe(true);

    // Step 2: Drag the pile OUT of the zone to a different position
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      // Pile is now at zone position (75, 0); drag it far away
      await g.__ctTest!.drag({ x: 75, y: 0 }, { x: -150, y: 0 }, { steps: 10 });
      await g.__TEST_BOARD__!.waitForRenderer();
    });

    // Verify containerId was cleared after drag-out
    const afterDragOut = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const all = store.getAllObjects();
      for (const [, obj] of all) {
        if (
          obj._kind === 'stack' &&
          obj._cards?.some((e) => e.code === 'e2e-redisc-card')
        ) {
          return { containerId: obj._containerId, pos: obj._pos };
        }
      }
      return { containerId: 'NOT_FOUND', pos: null };
    });
    // _containerId must be null after drag-out — the fix clears it in moveObjects
    expect(afterDragOut.containerId).toBeNull();

    // Step 3: Select the dragged-out pile and press X again
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      // Pile is now at (-150, 0) after drag-out
      g.__ctTest!.click({ x: -150, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });
    await page.keyboard.press('x');
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });

    // Verify the card re-discarded to the zone (not just flipped in place)
    const afterRediscard = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const all = store.getAllObjects();
      for (const [, obj] of all) {
        if (
          obj._kind === 'stack' &&
          obj._containerId === 'e2e-redisc-zone' &&
          obj._cards?.some((e) => e.code === 'e2e-redisc-card')
        ) {
          return {
            found: true,
            containerId: obj._containerId,
            faceUp: obj._faceUp,
            pos: obj._pos,
          };
        }
      }
      return { found: false, containerId: null, faceUp: null, pos: null };
    });

    // Card must be back in the zone (containerId re-set), face-up, at zone position
    expect(afterRediscard.found).toBe(true);
    expect(afterRediscard.containerId).toBe('e2e-redisc-zone');
    expect(afterRediscard.faceUp).toBe(true);
    // Card must be at the zone position, not at the drag-out position
    expect(afterRediscard.pos).not.toBeNull();
    expect((afterRediscard.pos as { x: number; y: number }).x).toBe(75);
  });
});
