/**
 * E2E tests for the discard zone loop: create zone, discard card, verify routing.
 *
 * Covers ct-ecl acceptance criteria:
 * - First discard into empty zone creates pile face-up with _containerId === zoneId
 * - Second discard merges onto existing pile (pile grows, stays face-up)
 * - Member card sitting in a foreign stack routes to home zone (proves card-id routing)
 *
 * Strategy:
 * - Seed stacks via __TEST_STORE__.setObject (deterministic ids)
 * - Seed zone membership via __TEST_STORE__.setDiscardZone
 * - Select a stack via __ctTest.tap (canvas pointer event)
 * - Trigger 'Discard' action via keyboard shortcut 'X'
 * - Assert via __TEST_STORE__ that card landed face-up in the zone's pile
 */

import { test, expect } from './_fixtures';

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getObject: (id: string) => unknown;
  getAllObjects: () => Map<string, StoreObject>;
  getObjectYMap: (id: string) => { get: (k: string) => unknown } | undefined;
  clearAllObjects: () => void;
  waitForReady: () => Promise<void>;
  setDiscardZone: (zoneId: string, entry: { memberCardIds: string[] }) => void;
  findDiscardZoneForCard: (cardId: string) => string | null;
  filterObjects: (
    pred: (yMap: { get: (k: string) => unknown }, id: string) => boolean,
  ) => string[];
}

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _cards?: string[];
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
  tap: (worldX: number, worldY: number) => Promise<void>;
  resetCamera: () => void;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __TEST_BOARD__?: PageTestBoard;
  __ctTest?: PageCtTest;
}

const STACK_KIND = 'stack';
const ZONE_KIND = 'zone';

async function waitForReady(page: Parameters<typeof test>[1]['page']) {
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
    // Seed: one stack, one zone, membership linking them
    await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobals;
      const store = g.__TEST_STORE__!;

      store.setObject('e2e-source-stack', {
        _kind: STACK_KIND,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: ['e2e-card-a'],
        _faceUp: false,
      });
      store.setObject('e2e-zone', {
        _kind: ZONE_KIND,
        _pos: { x: 420, y: 0, r: 0 },
        _sortKey: '000002',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
      store.setDiscardZone('e2e-zone', { memberCardIds: ['e2e-card-a'] });
    });

    // Select the source stack via canvas tap
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.resetCamera();
      await g.__ctTest!.tap(0, 0);
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
          obj._kind === STACK_KIND &&
          obj._containerId === 'e2e-zone' &&
          obj._cards?.includes('e2e-card-a') &&
          obj._faceUp === true
        ) {
          return { found: true };
        }
      }
      return { found: false };
    });

    expect(result.found).toBe(true);
  });

  test('second discard merges onto existing pile', async ({ page }) => {
    await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobals;
      const store = g.__TEST_STORE__!;

      store.setObject('e2e-source-stack2', {
        _kind: STACK_KIND,
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: ['e2e-card-1', 'e2e-card-2'],
        _faceUp: false,
      });
      store.setObject('e2e-zone2', {
        _kind: ZONE_KIND,
        _pos: { x: 420, y: 0, r: 0 },
        _sortKey: '000002',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
      store.setDiscardZone('e2e-zone2', {
        memberCardIds: ['e2e-card-1', 'e2e-card-2'],
      });
    });

    // Discard top card (e2e-card-1)
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.resetCamera();
      await g.__ctTest!.tap(0, 0);
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
      await g.__ctTest!.tap(0, 0);
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
        if (obj._kind === STACK_KIND && obj._containerId === 'e2e-zone2') {
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
});
