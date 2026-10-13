/**
 * E2E coverage for drawing from a stack (ct-7mv.5).
 *
 * D / T draw the top card (or N cards after typing a number) of each selected
 * stack to the hand / onto the table; Shift+D / Shift+T draw all. A draw
 * crosses keyboard handling, the store, the canvas and the hand panel, so
 * only a browser run shows them working together.
 *
 * Strategy:
 * - `/table/:id` route (draw actions and the hand panel are not registered on
 *   `/dev/table/:id`).
 * - Decks are seeded through `__TEST_STORE__`; the fixture clears the store on
 *   navigation, so URL seeds cannot be used.
 * - Decks are selected with a canvas click (`__ctTest.click`), the draws are
 *   real key presses, and results are read from the store (card lists,
 *   `_faceUp`, `_pos`, hand cards), not from pixels.
 */

import type { Page } from '@playwright/test';
import { test, expect, skipNextAutoClear } from './_fixtures';

// app/src/renderer/constants.ts
const CARD_WIDTH = 63;
const CARD_HEIGHT = 88;
const TABLE_DRAW_GAP = 8;

const DECK_POS = { x: 0, y: -150 };
const OTHER_DECK_POS = { x: 250, y: -150 };

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _cards?: Array<{ code: string }>;
  _faceUp?: boolean;
  _selectedBy: string | null;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, StoreObject>;
  getHandIds: () => string[];
  getHandCards: (handId: string) => Array<{ code: string }>;
  waitForReady: () => Promise<void>;
}

interface PageCtTest {
  click: (
    pt: { x: number; y: number },
    opts?: { modifiers?: { metaKey?: boolean } },
  ) => void;
  worldToViewport: (pt: { x: number; y: number }) => { x: number; y: number };
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: PageCtTest;
}

interface TableStack {
  id: string;
  cards: string[];
  pos: { x: number; y: number };
  faceUp: boolean | undefined;
}

const DECK_ID = 'e2e-draw-deck';
const OTHER_DECK_ID = 'e2e-draw-deck-2';

async function waitForTableReady(page: Page): Promise<void> {
  const canvas = page.getByTestId('board-canvas');
  await expect(canvas).toBeVisible({ timeout: 10000 });
  await expect(canvas).toHaveAttribute('data-canvas-initialized', 'true', {
    timeout: 10000,
  });
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as PageGlobals).__ctTest),
    { timeout: 10000 },
  );
  await expect(page.locator('.hand-panel')).toBeVisible({ timeout: 10000 });
}

async function openTable(page: Page, testId: string): Promise<string> {
  const tableId = `draw-${testId.replace(/[^a-z0-9]/gi, '-')}`;
  await page.goto(`/table/${tableId}`);
  await waitForTableReady(page);
  return tableId;
}

async function seedDeck(
  page: Page,
  id: string,
  pos: { x: number; y: number },
  codes: string[],
  faceUp = true,
): Promise<void> {
  await page.evaluate(
    ({ id, pos, codes, faceUp }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject(id, {
        _kind: 'stack',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: id,
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: codes.map((code) => ({ code })),
        _faceUp: faceUp,
      });
    },
    { id, pos, codes, faceUp },
  );
}

/** Seed the standard five-card deck c1..c5 (c1 on top). */
function seedFiveCardDeck(page: Page, faceUp = true): Promise<void> {
  return seedDeck(
    page,
    DECK_ID,
    DECK_POS,
    ['c1', 'c2', 'c3', 'c4', 'c5'],
    faceUp,
  );
}

function getStacks(page: Page): Promise<TableStack[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries())
      .filter(([, obj]) => obj._kind === 'stack')
      .map(([id, obj]) => ({
        id,
        cards: (obj._cards ?? []).map((card) => card.code),
        pos: { x: obj._pos.x, y: obj._pos.y },
        faceUp: obj._faceUp,
      }));
  });
}

async function getDeck(
  page: Page,
  id: string,
): Promise<TableStack | undefined> {
  return (await getStacks(page)).find((stack) => stack.id === id);
}

/** Stacks other than the given source decks, sorted left to right. */
async function getDrawnStacks(
  page: Page,
  sourceIds: string[],
): Promise<TableStack[]> {
  return (await getStacks(page))
    .filter((stack) => !sourceIds.includes(stack.id))
    .sort((a, b) => a.pos.x - b.pos.x);
}

/** Cards in every hand, in order. */
function getHandCodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return store
      .getHandIds()
      .flatMap((handId) => store.getHandCards(handId).map((card) => card.code));
  });
}

/** Click the stack at `pos`; `additive` holds Meta to extend the selection. */
async function clickStack(
  page: Page,
  pos: { x: number; y: number },
  additive = false,
): Promise<void> {
  await page.evaluate(
    ({ pos, additive }) => {
      const ctTest = (globalThis as unknown as PageGlobals).__ctTest!;
      ctTest.click(pos, additive ? { modifiers: { metaKey: true } } : {});
    },
    { pos, additive },
  );
}

async function selectDeck(
  page: Page,
  id: string,
  pos: { x: number; y: number },
  additive = false,
): Promise<void> {
  await clickStack(page, pos, additive);
  await expect
    .poll(() =>
      page.evaluate(
        (deckId) =>
          (globalThis as unknown as PageGlobals)
            .__TEST_STORE__!.getAllObjects()
            .get(deckId)?._selectedBy ?? null,
        id,
      ),
    )
    .not.toBeNull();
}

/**
 * Number of update records y-indexeddb has stored for the table. y-indexeddb
 * batches writes behind a debounce, so a reload right after a change loses it
 * unless the next batch has landed.
 */
function getPersistedUpdateCount(page: Page, tableId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(`cardtable-${id}`);
        open.onerror = () => reject(new Error('indexedDB.open failed'));
        open.onsuccess = () => {
          const db = open.result;
          const count = db
            .transaction('updates', 'readonly')
            .objectStore('updates')
            .count();
          count.onerror = () => reject(new Error('updates count failed'));
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
    tableId,
  );
}

const indicator = (page: Page) => page.getByTestId('numeric-prefix-indicator');

test.describe('Stack draw — D / T / Shift+D / Shift+T', () => {
  test('1. D draws the top card to the hand', async ({ page }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('d');

    await expect.poll(() => getHandCodes(page)).toEqual(['c1']);
    expect((await getDeck(page, DECK_ID))?.cards).toEqual([
      'c2',
      'c3',
      'c4',
      'c5',
    ]);
  });

  test('2. T draws the top card to the table directly below the deck', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('t');

    await expect
      .poll(async () => (await getDrawnStacks(page, [DECK_ID])).length)
      .toBe(1);
    const [drawn] = await getDrawnStacks(page, [DECK_ID]);
    expect(drawn.cards).toEqual(['c1']);
    expect(drawn.pos.x).toBe(DECK_POS.x);
    expect(drawn.pos.y).toBe(DECK_POS.y + CARD_HEIGHT + TABLE_DRAW_GAP);
    expect((await getDeck(page, DECK_ID))?.cards).toEqual([
      'c2',
      'c3',
      'c4',
      'c5',
    ]);
    expect(await getHandCodes(page)).toEqual([]);
  });

  test('3. 3 then D shows the indicator, then draws three to the hand', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await expect(indicator(page)).toHaveCount(0);
    await page.keyboard.press('3');
    await expect(indicator(page)).toHaveText('3');

    await page.keyboard.press('d');

    await expect.poll(() => getHandCodes(page)).toEqual(['c1', 'c2', 'c3']);
    await expect(indicator(page)).toHaveCount(0);
    expect((await getDeck(page, DECK_ID))?.cards).toEqual(['c4', 'c5']);
  });

  test('4. 3 then T draws three single-card stacks in a row', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('3');
    await expect(indicator(page)).toHaveText('3');
    await page.keyboard.press('t');

    await expect
      .poll(async () => (await getDrawnStacks(page, [DECK_ID])).length)
      .toBe(3);
    const drawn = await getDrawnStacks(page, [DECK_ID]);
    expect(drawn.map((stack) => stack.cards)).toEqual([['c1'], ['c2'], ['c3']]);
    const rowY = DECK_POS.y + CARD_HEIGHT + TABLE_DRAW_GAP;
    drawn.forEach((stack, i) => {
      expect(stack.pos.y).toBe(rowY);
      expect(stack.pos.x).toBe(DECK_POS.x + i * (CARD_WIDTH + TABLE_DRAW_GAP));
    });
    expect((await getDeck(page, DECK_ID))?.cards).toEqual(['c4', 'c5']);
  });

  test('5. Shift+D draws the whole deck to the hand and removes the deck', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('Shift+D');

    await expect
      .poll(() => getHandCodes(page))
      .toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(await getDeck(page, DECK_ID)).toBeUndefined();
    expect(await getStacks(page)).toEqual([]);
  });

  test('6. Shift+T lays the whole deck out in a row and removes the deck', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('Shift+T');

    await expect.poll(async () => (await getStacks(page)).length).toBe(5);
    expect(await getDeck(page, DECK_ID)).toBeUndefined();
    const drawn = await getDrawnStacks(page, [DECK_ID]);
    expect(drawn.map((stack) => stack.cards)).toEqual([
      ['c1'],
      ['c2'],
      ['c3'],
      ['c4'],
      ['c5'],
    ]);
    const rowY = DECK_POS.y + CARD_HEIGHT + TABLE_DRAW_GAP;
    drawn.forEach((stack, i) => {
      expect(stack.pos.y).toBe(rowY);
      expect(stack.pos.x).toBe(DECK_POS.x + i * (CARD_WIDTH + TABLE_DRAW_GAP));
    });
    expect(await getHandCodes(page)).toEqual([]);
  });

  test('7. a number larger than the deck clamps, with no error toast', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('9');
    await page.keyboard.press('d');

    await expect
      .poll(() => getHandCodes(page))
      .toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(await getDeck(page, DECK_ID)).toBeUndefined();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('8a. a face-down deck draws face-down stacks', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('f');
    await expect
      .poll(async () => (await getDeck(page, DECK_ID))?.faceUp)
      .toBe(false);

    await page.keyboard.press('2');
    await page.keyboard.press('t');

    await expect
      .poll(async () => (await getDrawnStacks(page, [DECK_ID])).length)
      .toBe(2);
    const drawn = await getDrawnStacks(page, [DECK_ID]);
    expect(drawn.map((stack) => stack.faceUp)).toEqual([false, false]);
    expect((await getDeck(page, DECK_ID))?.cards).toHaveLength(3);
  });

  test('8b. a face-up deck draws face-up stacks', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('2');
    await page.keyboard.press('t');

    await expect
      .poll(async () => (await getDrawnStacks(page, [DECK_ID])).length)
      .toBe(2);
    const drawn = await getDrawnStacks(page, [DECK_ID]);
    expect(drawn.map((stack) => stack.faceUp)).toEqual([true, true]);
  });

  test('9. two selected decks each give N cards', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, DECK_ID, DECK_POS, ['a1', 'a2']);
    await seedDeck(page, OTHER_DECK_ID, OTHER_DECK_POS, ['b1', 'b2', 'b3']);
    await selectDeck(page, DECK_ID, DECK_POS);
    await selectDeck(page, OTHER_DECK_ID, OTHER_DECK_POS, true);

    await page.keyboard.press('2');
    await page.keyboard.press('d');

    await expect.poll(async () => (await getHandCodes(page)).length).toBe(4);
    expect([...(await getHandCodes(page))].sort()).toEqual([
      'a1',
      'a2',
      'b1',
      'b2',
    ]);
    expect(await getDeck(page, DECK_ID)).toBeUndefined();
    expect((await getDeck(page, OTHER_DECK_ID))?.cards).toEqual(['b3']);
  });

  test('10. drawn stacks and the hand survive a reload', async ({
    page,
  }, testInfo) => {
    const tableId = await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    // Let the seed flush first so the draws land in a later write.
    await expect
      .poll(() => getPersistedUpdateCount(page, tableId))
      .toBeGreaterThan(0);
    const updatesBeforeDraw = await getPersistedUpdateCount(page, tableId);

    await page.keyboard.press('2');
    await page.keyboard.press('t');
    await expect
      .poll(async () => (await getDrawnStacks(page, [DECK_ID])).length)
      .toBe(2);
    await page.keyboard.press('d');
    await expect.poll(() => getHandCodes(page)).toEqual(['c3']);

    const stacksBefore = (await getStacks(page)).sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    await expect
      .poll(() => getPersistedUpdateCount(page, tableId))
      .toBeGreaterThan(updatesBeforeDraw);
    skipNextAutoClear(page);
    await page.goto(`/table/${tableId}`);
    await waitForTableReady(page);
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_STORE__!.waitForReady();
    });

    await expect.poll(() => getHandCodes(page)).toEqual(['c3']);
    const stacksAfter = (await getStacks(page)).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(stacksAfter).toEqual(stacksBefore);
    expect(stacksAfter).toHaveLength(3);
    expect((await getDeck(page, DECK_ID))?.cards).toEqual(['c4', 'c5']);
  });

  test('11. digits typed into a text input are ignored', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.getByRole('button', { name: 'Open command palette' }).click();
    const input = page.locator('input[placeholder*="Search"]').first();
    await expect(input).toBeVisible();
    await page.keyboard.type('3');
    await expect(input).toHaveValue('3');
    await expect(indicator(page)).toHaveCount(0);

    // Escape closes the palette (it can take more than one press).
    const dialog = page.getByRole('dialog');
    await expect(async () => {
      if (await dialog.count()) await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 5000 });

    await page.keyboard.press('d');

    await expect.poll(() => getHandCodes(page)).toEqual(['c1']);
    expect((await getDeck(page, DECK_ID))?.cards).toHaveLength(4);
  });

  test('12. A does nothing and the menu lists only the four draw entries', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedFiveCardDeck(page);
    await selectDeck(page, DECK_ID, DECK_POS);

    await page.keyboard.press('a');
    // Give a wrongly-surviving handler time to act before asserting nothing did.
    await page.waitForTimeout(500);
    expect(await getHandCodes(page)).toEqual([]);
    expect((await getDeck(page, DECK_ID))?.cards).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
    ]);
    expect(await getStacks(page)).toHaveLength(1);

    const viewport = await page.evaluate(
      (pos) =>
        (globalThis as unknown as PageGlobals).__ctTest!.worldToViewport(pos),
      DECK_POS,
    );
    await page.mouse.click(viewport.x, viewport.y, { button: 'right' });

    for (const label of [
      'Draw to Hand',
      'Draw to Table',
      'Draw All to Hand',
      'Draw All to Table',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Draw Card', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Deal Cards', { exact: true })).toHaveCount(0);
  });
});
