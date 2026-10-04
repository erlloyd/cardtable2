/**
 * E2E regression witness for HandPanel (ct-ajw.20).
 *
 * HandPanel has no unit test and no other E2E spec touches it. This spec
 * pins current behavior of the hand panel on the `/table/:id` route before
 * the T5b hooks refactor (render-time refs, imperative drag listeners,
 * ResizeObserver-driven fan layout):
 *
 * 1. Create a hand (tab appears, empty, 0 cards)
 * 2. Table -> hand (drop-target state during drag, cards land in hand)
 * 3. Reorder within hand (store order reflects the drop slot)
 * 4. Hand -> table phantom drag (card leaves hand, stack lands near drop)
 * 5. Collapse / expand (collapsed bar shows name + count)
 * 6. Resize (fan layout re-measures; cards stay reachable)
 *
 * Strategy:
 * - `/table/:id` route (the hand panel is not mounted on `/dev/table/:id`).
 * - Hands/cards/stacks are seeded through `__TEST_STORE__`.
 * - Board drags use `__ctTest` canvas pointer events (docs/E2E-TESTING.md).
 * - Hand-card drags use `page.mouse`: the cards are plain DOM elements and
 *   HandPanel listens for pointer events on `window`, which Chromium emits
 *   for real mouse input.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _cards?: string[];
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, StoreObject>;
  createHand: (name: string) => string;
  getHandIds: () => string[];
  getHandCards: (handId: string) => string[];
  addCardToHand: (handId: string, cardId: string, index?: number) => void;
  deleteHand: (handId: string) => void;
}

interface PageCtTest {
  pointerDown: (pt: { x: number; y: number }) => void;
  pointerMove: (pt: { x: number; y: number }) => void;
  pointerUp: (pt: { x: number; y: number }) => void;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: PageCtTest;
}

async function openTable(page: Page, testId: string): Promise<void> {
  const tableId = `hand-${testId.replace(/[^a-z0-9]/gi, '-')}`;
  await page.goto(`/table/${tableId}`);
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

/** Create a hand holding the given cards; returns its id. */
async function seedHand(
  page: Page,
  name: string,
  cards: string[],
): Promise<string> {
  const handId = await page.evaluate(
    ({ name, cards }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const id = store.createHand(name);
      for (const card of cards) store.addCardToHand(id, card);
      return id;
    },
    { name, cards },
  );
  await expect(page.locator('.hand-panel__tab--active')).toHaveText(name);
  return handId;
}

function getHandCards(page: Page, handId: string): Promise<string[]> {
  return page.evaluate(
    (id) =>
      (globalThis as unknown as PageGlobals).__TEST_STORE__!.getHandCards(id),
    handId,
  );
}

function getBoardObjects(
  page: Page,
): Promise<Array<{ id: string; pos: StoreObject['_pos']; cards: string[] }>> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries()).map(([id, obj]) => ({
      id,
      pos: obj._pos,
      cards: obj._cards ?? [],
    }));
  });
}

/** Viewport-space center of a locator. */
async function centerOf(
  page: Page,
  selector: string,
  nth = 0,
): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).nth(nth).boundingBox();
  if (!box) throw new Error(`No bounding box for ${selector}[${nth}]`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Layout left edge (viewport-space) of the nth hand card. Uses offsetLeft
 * rather than a bounding box so the hover scale transform on a card under
 * the mouse does not skew the measurement.
 */
function cardLeft(page: Page, nth: number): Promise<number> {
  return page.evaluate((n) => {
    const container = document.querySelector('.hand-panel__cards')!;
    const card = document.querySelectorAll<HTMLElement>('.hand-panel__card')[n];
    return container.getBoundingClientRect().left + card.offsetLeft;
  }, nth);
}

/**
 * Begin a canvas drag of the object at world `from` and move toward the
 * viewport point `toViewport`, without releasing. Returns the world point
 * the drag ended on so the caller can release at the same spot.
 */
async function beginBoardDragTo(
  page: Page,
  from: { x: number; y: number },
  toViewport: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const to = await page.evaluate((toViewport) => {
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (toViewport.x - rect.left - canvas.clientWidth / 2) * dpr,
      y: (toViewport.y - rect.top - canvas.clientHeight / 2) * dpr,
    };
  }, toViewport);
  const target = { x: to.x, y: to.y };
  const steps = 10;
  await page.evaluate((pt) => {
    (globalThis as unknown as PageGlobals).__ctTest!.pointerDown(pt);
  }, from);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.evaluate(
      (pt) => {
        (globalThis as unknown as PageGlobals).__ctTest!.pointerMove(pt);
      },
      {
        x: from.x + (target.x - from.x) * t,
        y: from.y + (target.y - from.y) * t,
      },
    );
    await page.waitForTimeout(30);
  }
  return target;
}

test.describe('HandPanel (ct-ajw.20 regression witness)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openTable(page, testInfo.testId);
  });

  test('1. create a hand: tab appears, hand is empty', async ({ page }) => {
    // No hands yet: the empty prompt is shown and there are no tabs.
    await expect(page.locator('.hand-panel__tab')).toHaveCount(0);
    await expect(page.locator('.hand-panel__empty')).toHaveText(
      'Create a hand to get started.',
    );

    await page.getByRole('button', { name: 'Create new hand' }).click();

    await expect(page.locator('.hand-panel__tab')).toHaveCount(1);
    await expect(page.locator('.hand-panel__tab--active')).toHaveText('Hand 1');
    await expect(page.locator('.hand-panel__card')).toHaveCount(0);

    const handIds = await page.evaluate(() =>
      (globalThis as unknown as PageGlobals).__TEST_STORE__!.getHandIds(),
    );
    expect(handIds).toHaveLength(1);
    expect(await getHandCards(page, handIds[0])).toEqual([]);

    // Count is surfaced on the collapsed bar.
    await page.getByRole('button', { name: 'Collapse hand panel' }).click();
    await expect(page.locator('.hand-panel__count')).toHaveText('0 cards');
  });

  test('2. table -> hand: drop-target state shows and cards land in hand', async ({
    page,
  }) => {
    const handId = await seedHand(page, 'Hand 1', []);

    // Two stacks so the board count visibly drops by exactly one.
    await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject('e2e-drag-stack', {
        _kind: 'stack',
        _pos: { x: 0, y: -100, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: ['drag-a', 'drag-b'],
        _faceUp: true,
      });
      store.setObject('e2e-bystander-stack', {
        _kind: 'stack',
        _pos: { x: 300, y: -100, r: 0 },
        _sortKey: '000002',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: ['bystander-a'],
        _faceUp: true,
      });
    });
    await expect.poll(async () => (await getBoardObjects(page)).length).toBe(2);

    const panel = page.locator('.hand-panel');
    await expect(panel).not.toHaveClass(/hand-panel--drop-target/);

    const panelCenter = await centerOf(page, '.hand-panel');
    const dropWorld = await beginBoardDragTo(
      page,
      { x: 0, y: -100 },
      panelCenter,
    );

    // Hovering a dragged stack over the panel flags it as a drop target.
    // Selection and drag-start arrive from the renderer worker
    // asynchronously, and the table route only re-evaluates the hover on
    // pointermove, so keep nudging the pointer over the panel until it lands.
    await expect(async () => {
      await page.evaluate((pt) => {
        (globalThis as unknown as PageGlobals).__ctTest!.pointerMove(pt);
      }, dropWorld);
      await expect(panel).toHaveClass(/hand-panel--drop-target/, {
        timeout: 200,
      });
    }).toPass({ timeout: 10000 });

    await page.evaluate((pt) => {
      (globalThis as unknown as PageGlobals).__ctTest!.pointerUp(pt);
    }, dropWorld);

    await expect
      .poll(() => getHandCards(page, handId))
      .toEqual(['drag-a', 'drag-b']);
    const board = await getBoardObjects(page);
    expect(board).toHaveLength(1);
    expect(board[0].cards).toEqual(['bystander-a']);
    await expect(panel).not.toHaveClass(/hand-panel--drop-target/);
    await expect(page.locator('.hand-panel__card')).toHaveCount(2);
  });

  test('3. reorder in hand: dragging the first card past the third reorders the store', async ({
    page,
  }) => {
    const handId = await seedHand(page, 'Hand 1', ['A', 'B', 'C', 'D']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(4);

    const start = await centerOf(page, '.hand-panel__card', 0);
    // Insertion slot is round((x - cardsLeft - startOffset) / spacing), so
    // the left edge of card 2 (+ a few px) targets slot 2.
    const targetX = (await cardLeft(page, 2)) + 5;

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 10, start.y, { steps: 3 });
    await page.mouse.move(targetX, start.y, { steps: 10 });

    // Mid-drag: the dragged card is replaced by the ghost and an insertion
    // indicator marks the target slot.
    await expect(page.locator('.hand-panel__insertion-indicator')).toHaveCount(
      1,
    );
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);

    await page.mouse.up();

    await expect
      .poll(() => getHandCards(page, handId))
      .toEqual(['B', 'C', 'A', 'D']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(4);
    await expect(page.locator('.hand-panel__insertion-indicator')).toHaveCount(
      0,
    );
    await expect(page.locator('.hand-panel__card-placeholder')).toHaveText([
      'B',
      'C',
      'A',
      'D',
    ]);
  });

  test('4. hand -> table: phantom drag moves the card onto the board', async ({
    page,
  }) => {
    const handId = await seedHand(page, 'Hand 1', ['A', 'B', 'C']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);
    expect(await getBoardObjects(page)).toHaveLength(0);

    const start = await centerOf(page, '.hand-panel__card', 0);
    const canvasBox = await page.getByTestId('board-canvas').boundingBox();
    if (!canvasBox) throw new Error('Canvas bounding box not available');
    const drop = {
      x: canvasBox.x + canvasBox.width / 2 + 200,
      y: canvasBox.y + canvasBox.height / 2 - 50,
    };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 10, start.y - 10, { steps: 3 });
    await page.mouse.move(drop.x, drop.y, { steps: 10 });
    // The renderer reports the board-space drop position asynchronously.
    await page.waitForTimeout(200);
    await page.mouse.up();

    await expect.poll(() => getHandCards(page, handId)).toEqual(['B', 'C']);
    await expect.poll(async () => (await getBoardObjects(page)).length).toBe(1);

    const [stack] = await getBoardObjects(page);
    expect(stack.cards).toEqual(['A']);

    // Dropped near the pointer: world coords = viewport offset from canvas
    // center, scaled by DPR (see ctTest.ts). Tolerance covers grid snapping.
    const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
    const expectedX = (drop.x - canvasBox.x - canvasBox.width / 2) * dpr;
    const expectedY = (drop.y - canvasBox.y - canvasBox.height / 2) * dpr;
    expect(Math.abs(stack.pos.x - expectedX)).toBeLessThan(60);
    expect(Math.abs(stack.pos.y - expectedY)).toBeLessThan(60);
    await expect(page.locator('.hand-panel__card')).toHaveCount(2);
  });

  /** Mouse down on hand card 0, cross the drag slop, move over the board. */
  async function dragFirstCardOverBoard(
    page: Page,
    offset = { x: 200, y: -50 },
  ): Promise<{ x: number; y: number }> {
    const start = await centerOf(page, '.hand-panel__card', 0);
    const canvasBox = await page.getByTestId('board-canvas').boundingBox();
    if (!canvasBox) throw new Error('Canvas bounding box not available');
    const drop = {
      x: canvasBox.x + canvasBox.width / 2 + offset.x,
      y: canvasBox.y + canvasBox.height / 2 + offset.y,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 10, start.y - 10, { steps: 3 });
    await page.mouse.move(drop.x, drop.y, { steps: 10 });
    // The renderer reports the board-space drop position asynchronously.
    await page.waitForTimeout(200);
    return drop;
  }

  /** A normal drag-and-drop of the first hand card onto the board. */
  async function dropFirstCardOnBoard(page: Page): Promise<void> {
    await dragFirstCardOverBoard(page);
    await page.mouse.up();
  }

  test('4b. Escape mid-drag cancels the drag and a new drag still works', async ({
    page,
  }) => {
    const handId = await seedHand(page, 'Hand 1', ['A', 'B', 'C']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);

    await dragFirstCardOverBoard(page);
    await page.keyboard.press('Escape');
    await page.mouse.up();

    // Card is back in the strip and nothing landed on the board.
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);
    expect(await getHandCards(page, handId)).toEqual(['A', 'B', 'C']);
    expect(await getBoardObjects(page)).toHaveLength(0);

    await dropFirstCardOnBoard(page);
    await expect.poll(() => getHandCards(page, handId)).toEqual(['B', 'C']);
    await expect.poll(async () => (await getBoardObjects(page)).length).toBe(1);
  });

  test('4c. pointercancel mid-drag cancels the drag and a new drag still works', async ({
    page,
  }) => {
    const handId = await seedHand(page, 'Hand 1', ['A', 'B', 'C']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);

    await dragFirstCardOverBoard(page);
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointercancel'));
    });
    await page.mouse.up();

    await expect(page.locator('.hand-panel__card')).toHaveCount(3);
    expect(await getHandCards(page, handId)).toEqual(['A', 'B', 'C']);
    expect(await getBoardObjects(page)).toHaveLength(0);

    await dropFirstCardOnBoard(page);
    await expect.poll(() => getHandCards(page, handId)).toEqual(['B', 'C']);
    await expect.poll(async () => (await getBoardObjects(page)).length).toBe(1);
  });

  test('4d. dropping a hand card onto an existing stack merges into it', async ({
    page,
  }) => {
    const handId = await seedHand(page, 'Hand 1', ['A', 'B']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(2);

    const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
    const stackWorld = { x: 0, y: -100 };
    await page.evaluate((pos) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject('e2e-target-stack', {
        _kind: 'stack',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: ['X'],
        _faceUp: true,
      });
    }, stackWorld);
    await expect.poll(async () => (await getBoardObjects(page)).length).toBe(1);

    // world -> viewport (inverse of the mapping test 4 uses)
    await dragFirstCardOverBoard(page, {
      x: stackWorld.x / dpr,
      y: stackWorld.y / dpr,
    });
    await page.mouse.up();

    await expect.poll(() => getHandCards(page, handId)).toEqual(['B']);
    await expect
      .poll(async () => {
        const board = await getBoardObjects(page);
        return board.length === 1 ? [...board[0].cards].sort() : null;
      })
      .toEqual(['A', 'X']);
  });

  test('4e. active hand changing mid-drag cancels the drag', async ({
    page,
  }) => {
    const hand1 = await seedHand(page, 'Hand 1', ['A', 'B', 'C']);
    const hand2 = await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const id = store.createHand('Hand 2');
      store.addCardToHand(id, 'D');
      return id;
    });
    await expect(page.locator('.hand-panel__tab')).toHaveCount(2);
    await expect(page.locator('.hand-panel__tab--active')).toHaveText('Hand 1');
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);

    await dragFirstCardOverBoard(page);
    // A peer deletes the hand being dragged from; the panel switches to Hand 2.
    await page.evaluate((id) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.deleteHand(id);
    }, hand1);
    await expect(page.locator('.hand-panel__tab--active')).toHaveText('Hand 2');
    await page.mouse.up();

    expect(await getBoardObjects(page)).toHaveLength(0);
    expect(await getHandCards(page, hand2)).toEqual(['D']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(1);
  });

  test('5. collapse / expand: collapsed bar shows name and count', async ({
    page,
  }) => {
    await seedHand(page, 'Hand 1', ['A', 'B', 'C']);
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);

    await page.getByRole('button', { name: 'Collapse hand panel' }).click();

    const panel = page.locator('.hand-panel');
    await expect(panel).toHaveClass(/hand-panel--collapsed/);
    await expect(page.locator('.hand-panel__name')).toHaveText('Hand 1');
    await expect(page.locator('.hand-panel__count')).toHaveText('3 cards');
    await expect(page.locator('.hand-panel__card')).toHaveCount(0);

    await page.getByRole('button', { name: 'Expand hand panel' }).click();

    await expect(panel).not.toHaveClass(/hand-panel--collapsed/);
    await expect(page.locator('.hand-panel__card')).toHaveCount(3);
    await expect(page.locator('.hand-panel__card-placeholder')).toHaveText([
      'A',
      'B',
      'C',
    ]);
  });

  test('6. resize: fan layout re-measures and cards stay reachable', async ({
    page,
  }) => {
    const cards = Array.from({ length: 20 }, (_, i) => `card-${i}`);
    await seedHand(page, 'Hand 1', cards);
    const cardEls = page.locator('.hand-panel__card');
    const rightArrow = page.getByRole('button', { name: 'Scroll cards right' });

    // Wide: 20 * 72px fits without overlap, no scroll arrows.
    await page.setViewportSize({ width: 1800, height: 800 });
    await expect(cardEls).toHaveCount(20);
    await expect
      .poll(async () => (await cardLeft(page, 1)) - (await cardLeft(page, 0)))
      .toBeCloseTo(72, 0);
    await expect(rightArrow).toHaveCount(0);
    const wrapperBox = await page
      .locator('.hand-panel__cards-wrapper')
      .boundingBox();
    if (!wrapperBox) throw new Error('Cards wrapper has no bounding box');
    const firstWide = await cardLeft(page, 0);
    const lastWide = await cardLeft(page, 19);
    expect(firstWide).toBeGreaterThanOrEqual(wrapperBox.x);
    expect(lastWide + 72).toBeLessThanOrEqual(wrapperBox.x + wrapperBox.width);

    // Narrow: cards overlap past the max, so the strip scrolls and the
    // right arrow appears. Spacing shrinks to the 50% max overlap (36px).
    await page.setViewportSize({ width: 500, height: 800 });
    await expect(rightArrow).toBeVisible();
    await expect
      .poll(async () => (await cardLeft(page, 1)) - (await cardLeft(page, 0)))
      .toBeCloseTo(36, 0);

    // Scrolling right brings the last card into view.
    for (let i = 0; i < 12; i++) {
      if ((await rightArrow.count()) === 0) break;
      await rightArrow.click();
      await page.waitForTimeout(250);
    }
    const narrowWrapper = await page
      .locator('.hand-panel__cards-wrapper')
      .boundingBox();
    if (!narrowWrapper) throw new Error('Cards wrapper has no bounding box');
    await expect(
      page.getByRole('button', { name: 'Scroll cards left' }),
    ).toBeVisible();
    const lastNarrow = await cardLeft(page, 19);
    expect(lastNarrow + 72).toBeLessThanOrEqual(
      narrowWrapper.x + narrowWrapper.width + 1,
    );

    // Wide again: layout returns to the non-overlapping fan.
    await page.setViewportSize({ width: 1800, height: 800 });
    await expect
      .poll(async () => (await cardLeft(page, 1)) - (await cardLeft(page, 0)))
      .toBeCloseTo(72, 0);
    await expect(rightArrow).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Scroll cards left' }),
    ).toHaveCount(0);
  });

  test('switching hands never renders the empty state (ct-ajw.33)', async ({
    page,
  }) => {
    const snapshotWarnings: string[] = [];
    page.on('console', (msg) => {
      if (/getSnapshot|Maximum update depth/.test(msg.text())) {
        snapshotWarnings.push(msg.text());
      }
    });
    await seedHand(page, 'Alpha', ['card-a']);
    await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.addCardToHand(store.createHand('Beta'), 'card-b');
    });
    await expect(page.locator('.hand-panel__tab')).toHaveCount(2);
    await expect(page.locator('.hand-panel__card')).toHaveCount(1);

    await page.evaluate(() => {
      const w = window as unknown as { __emptySeen: number };
      w.__emptySeen = 0;
      const isEmpty = (n: Node): boolean =>
        n instanceof Element &&
        (n.matches('.hand-panel__empty') ||
          n.querySelector('.hand-panel__empty') !== null);
      new MutationObserver((records) => {
        for (const r of records) {
          if (Array.from(r.addedNodes).some(isEmpty)) w.__emptySeen++;
        }
        if (document.querySelector('.hand-panel__empty')) w.__emptySeen++;
      }).observe(document.body, { childList: true, subtree: true });
    });

    const alpha = page.locator('.hand-panel__tab', { hasText: 'Alpha' });
    const beta = page.locator('.hand-panel__tab', { hasText: 'Beta' });
    for (let i = 0; i < 5; i++) {
      await alpha.click();
      await expect(alpha).toHaveClass(/hand-panel__tab--active/);
      await expect(page.locator('.hand-panel__card')).toHaveCount(1);
      await beta.click();
      await expect(beta).toHaveClass(/hand-panel__tab--active/);
      await expect(page.locator('.hand-panel__card')).toHaveCount(1);
    }

    const emptySeen = await page.evaluate(
      () => (window as unknown as { __emptySeen: number }).__emptySeen,
    );
    expect(emptySeen).toBe(0);
    expect(snapshotWarnings).toEqual([]);
  });
});
