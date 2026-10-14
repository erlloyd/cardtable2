/**
 * E2E for discarding hand cards and Play placement (ct-3pj.4).
 *
 * 1. The x button discards a hand card to its own home-zone pile
 * 2. X over a hand card discards only that card, not the table selection
 * 3. No discard zone: toast, card stays in hand
 * 4. Play lands low in the view, at different spots
 * 5. Touch layout: both controls visible, x never drags or feeds double-tap
 *
 * Strategy:
 * - `/table/:id` route (the hand panel is not mounted on `/dev/table/:id`).
 * - Hands, zones and stacks are seeded through `__TEST_STORE__`.
 * - Hand cards are plain DOM, driven with `page.mouse` / `page.touchscreen`.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

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
  _selectedBy?: string | null;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, StoreObject>;
  createHand: (name: string) => string;
  getHandCards: (handId: string) => CardEntry[];
  addCardToHand: (handId: string, card: CardEntry, index?: number) => void;
  setGameAssets: (assets: unknown) => void;
}

interface PageCtTest {
  click: (pt: { x: number; y: number }) => void;
  probeObjects: (limit?: number) => Array<{
    id: string;
    kind: string;
    world: { x: number; y: number; r: number };
    viewport: { x: number; y: number };
  }>;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: PageCtTest;
}

interface StackSummary {
  id: string;
  pos: { x: number; y: number; r: number };
  cards: string[];
  faceUp: boolean | undefined;
  containerId: string | null | undefined;
}

const ZONE_ID = 'e2e-zone';
const ZONE_POS = { x: 300, y: 0 };

async function openTable(page: Page, testId: string): Promise<void> {
  const tableId = `hdp-${testId.replace(/[^a-z0-9]/gi, '-')}`;
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

async function seedZone(page: Page): Promise<void> {
  await page.evaluate(
    ({ id, pos }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject(id, {
        _kind: 'zone',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: '000001',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
    },
    { id: ZONE_ID, pos: ZONE_POS },
  );
}

/** Create a hand holding `cards`; returns its id. */
async function seedHand(page: Page, cards: CardEntry[]): Promise<string> {
  const handId = await page.evaluate((entries) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    const id = store.createHand('Hand 1');
    for (const entry of entries) store.addCardToHand(id, entry);
    return id;
  }, cards);
  await expect(page.locator('.hand-panel__card')).toHaveCount(cards.length);
  return handId;
}

function getHandCodes(page: Page, handId: string): Promise<string[]> {
  return page.evaluate(
    (id) =>
      (globalThis as unknown as PageGlobals)
        .__TEST_STORE__!.getHandCards(id)
        .map((card) => card.code),
    handId,
  );
}

function getStacks(page: Page): Promise<StackSummary[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries())
      .filter(([, obj]) => obj._kind === 'stack')
      .map(([id, obj]) => ({
        id,
        pos: obj._pos,
        cards: (obj._cards ?? []).map((card) => card.code),
        faceUp: obj._faceUp,
        containerId: obj._containerId,
      }));
  });
}

async function getZonePile(page: Page): Promise<StackSummary[]> {
  const stacks = await getStacks(page);
  return stacks.filter((stack) => stack.containerId === ZONE_ID);
}

async function hoverHandCard(page: Page, nth: number): Promise<void> {
  const box = await page.locator('.hand-panel__card').nth(nth).boundingBox();
  if (!box) throw new Error(`No bounding box for hand card ${nth}`);
  await page.mouse.move(box.x + 6, box.y + box.height / 2);
  await expect(page.locator('.hand-panel__card--hovered')).toHaveCount(1);
}

test.describe('Hand card discard and Play placement (ct-3pj.4)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openTable(page, testInfo.testId);
  });

  test('1. x button discards to the card own pile', async ({ page }) => {
    await seedZone(page);
    const handId = await seedHand(page, [
      { code: 'c1', homeZone: ZONE_ID },
      { code: 'c2', homeZone: ZONE_ID },
      { code: 'c3' },
    ]);

    await hoverHandCard(page, 0);
    const discardBtn = page
      .locator('.hand-panel__card')
      .nth(0)
      .locator('.hand-panel__discard-btn');
    await expect(discardBtn).toBeVisible();
    await expect(discardBtn).toHaveCSS('opacity', '1');
    await discardBtn.click();

    await expect.poll(() => getHandCodes(page, handId)).toEqual(['c2', 'c3']);
    const stacks = await getStacks(page);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].containerId).toBe(ZONE_ID);
    expect(stacks[0].cards).toEqual(['c1']);
    expect(stacks[0].faceUp).toBe(true);
    expect(stacks[0].pos.x).toBe(ZONE_POS.x);
    expect(stacks[0].pos.y).toBe(ZONE_POS.y);
  });

  test('2. X over a hand card discards only that card', async ({ page }) => {
    await seedZone(page);
    const handId = await seedHand(page, [
      { code: 'c1', homeZone: ZONE_ID },
      { code: 'c2', homeZone: ZONE_ID },
      { code: 'c3' },
    ]);
    await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject('e2e-table-stack', {
        _kind: 'stack',
        _pos: { x: -200, y: 0, r: 0 },
        _sortKey: '000002',
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: [{ code: 't1', homeZone: 'e2e-zone' }],
        _faceUp: false,
      });
    });
    await page.evaluate(() => {
      (globalThis as unknown as PageGlobals).__ctTest!.click({ x: -200, y: 0 });
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
          return store.getAllObjects().get('e2e-table-stack')?._selectedBy;
        }),
      )
      .toBeTruthy();

    await hoverHandCard(page, 0);
    await page.keyboard.press('x');

    await expect.poll(() => getHandCodes(page, handId)).toEqual(['c2', 'c3']);
    const pile = await getZonePile(page);
    expect(pile).toHaveLength(1);
    expect(pile[0].cards).toEqual(['c1']);
    const tableStack = (await getStacks(page)).find(
      (stack) => stack.id === 'e2e-table-stack',
    );
    expect(tableStack?.cards).toEqual(['t1']);
    expect(tableStack?.pos.x).toBe(-200);
    expect(tableStack?.pos.y).toBe(0);

    // Off the hand, X is the table-selection discard again.
    await page.mouse.move(400, 200);
    await expect(page.locator('.hand-panel__card--hovered')).toHaveCount(0);
    await page.keyboard.press('x');

    await expect
      .poll(async () => (await getStacks(page)).map((s) => s.id))
      .not.toContain('e2e-table-stack');
    const finalPile = await getZonePile(page);
    expect(finalPile).toHaveLength(1);
    expect([...finalPile[0].cards].sort()).toEqual(['c1', 't1']);
  });

  test('3. no discard zone: toast, card stays', async ({ page }) => {
    await seedZone(page);
    const handId = await seedHand(page, [
      { code: 'c1', homeZone: ZONE_ID },
      { code: 'c2', homeZone: ZONE_ID },
      { code: 'c3' },
    ]);
    const toasts = page.getByTestId('toast').filter({
      hasText: 'no discard zone',
    });

    await hoverHandCard(page, 2);
    await page.keyboard.press('x');
    await expect(toasts).toHaveCount(1);
    expect(await getHandCodes(page, handId)).toEqual(['c1', 'c2', 'c3']);
    expect(await getStacks(page)).toHaveLength(0);

    const discardBtn = page
      .locator('.hand-panel__card')
      .nth(2)
      .locator('.hand-panel__discard-btn');
    await expect(discardBtn).toBeVisible();
    await discardBtn.click();
    await expect(toasts).toHaveCount(2);
    expect(await getHandCodes(page, handId)).toEqual(['c1', 'c2', 'c3']);
    expect(await getStacks(page)).toHaveLength(0);
  });

  test('4. Play lands low in the view at different spots', async ({ page }) => {
    const handId = await seedHand(page, [
      { code: 'c1' },
      { code: 'c2' },
      { code: 'c3' },
    ]);
    const canvasBox = await page.locator('canvas').first().boundingBox();
    if (!canvasBox) throw new Error('No canvas bounding box');

    for (let played = 1; played <= 3; played++) {
      await page.mouse.move(5, 5);
      await hoverHandCard(page, 0);
      const playBtn = page
        .locator('.hand-panel__card')
        .nth(0)
        .locator('.hand-panel__play-btn');
      await expect(playBtn).toBeVisible();
      await playBtn.click();
      await expect
        .poll(async () => (await getStacks(page)).length)
        .toBe(played);
    }
    expect(await getHandCodes(page, handId)).toEqual([]);

    const probes = await page.evaluate(() =>
      (globalThis as unknown as PageGlobals)
        .__ctTest!.probeObjects(50)
        .filter((probe) => probe.kind === 'stack'),
    );
    expect(probes).toHaveLength(3);
    const midY = canvasBox.y + canvasBox.height / 2;
    for (const probe of probes) {
      expect(probe.viewport.x).toBeGreaterThan(canvasBox.x);
      expect(probe.viewport.x).toBeLessThan(canvasBox.x + canvasBox.width);
      expect(probe.viewport.y).toBeGreaterThan(midY);
      expect(probe.viewport.y).toBeLessThanOrEqual(
        canvasBox.y + canvasBox.height - 8,
      );
    }
    const keys = new Set(probes.map((p) => `${p.world.x},${p.world.y}`));
    expect(keys.size).toBe(3);
  });

  test('6. spread hand: x is centred on the card, below Play', async ({
    page,
  }) => {
    await seedHand(page, [{ code: 'c1' }, { code: 'c2' }, { code: 'c3' }]);

    await hoverHandCard(page, 1);
    // The hovered card animates, so read all three rects in one frame.
    const { cardBox, playBox, discardBox } = await page.evaluate(() => {
      const card = document.querySelectorAll('.hand-panel__card')[1];
      const rect = (selector: string) =>
        card.querySelector(selector)!.getBoundingClientRect();
      return {
        cardBox: card.getBoundingClientRect(),
        playBox: rect('.hand-panel__play-btn'),
        discardBox: rect('.hand-panel__discard-btn'),
      };
    });

    const cardCentre = cardBox.x + cardBox.width / 2;
    const discardCentre = discardBox.x + discardBox.width / 2;
    expect(Math.abs(discardCentre - cardCentre)).toBeLessThanOrEqual(1);
    expect(discardBox.y).toBeGreaterThanOrEqual(playBox.y + playBox.height);
    expect(discardBox.y - (playBox.y + playBox.height)).toBeLessThanOrEqual(12);
  });

  test('7. holding X discards one card; separate presses discard one each', async ({
    page,
  }) => {
    await seedZone(page);
    const handId = await seedHand(page, [
      { code: 'c1', homeZone: ZONE_ID },
      { code: 'c2', homeZone: ZONE_ID },
      { code: 'c3', homeZone: ZONE_ID },
      { code: 'c4', homeZone: ZONE_ID },
    ]);

    const firstBox = await page
      .locator('.hand-panel__card')
      .nth(0)
      .boundingBox();
    if (!firstBox) throw new Error('No bounding box for hand card 0');
    // The hand re-centres after each discard, so 120px in stays over some
    // card for every hand size down to one.
    const pointer = {
      x: firstBox.x + 120,
      y: firstBox.y + 62,
    };
    await page.mouse.move(pointer.x, pointer.y);
    await expect(page.locator('.hand-panel__card--hovered')).toHaveCount(1);

    // After the hand reflows under a still pointer, headless Chromium never
    // re-enters the card, so a step out of the card row and back stands in for
    // the browser re-hovering the card that slid under the pointer.
    const settleHover = async (): Promise<void> => {
      await page.mouse.move(pointer.x, firstBox.y - 15);
      await page.mouse.move(pointer.x, pointer.y);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    };

    // A key held in Playwright blocks the re-hover above, so the first keydown
    // is a real press and the auto-repeats a held key would send are
    // dispatched with repeat: true.
    const dispatchRepeat = (): Promise<void> =>
      page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'x',
            code: 'KeyX',
            repeat: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

    await page.keyboard.press('x');
    await expect.poll(() => getHandCodes(page, handId)).toHaveLength(3);
    for (let i = 0; i < 5; i++) {
      await settleHover();
      await dispatchRepeat();
    }
    await page.waitForTimeout(200);
    expect(await getHandCodes(page, handId)).toHaveLength(3);
    expect(await getZonePile(page)).toHaveLength(1);

    await settleHover();
    await page.keyboard.press('x');
    await expect.poll(() => getHandCodes(page, handId)).toHaveLength(2);

    // The card that reflowed under the still pointer is hovered, so a plain
    // press discards again: one card per press, never more.
    await page.keyboard.press('x');
    await expect.poll(() => getHandCodes(page, handId)).toHaveLength(1);
    await page.waitForTimeout(300);
    expect(await getHandCodes(page, handId)).toHaveLength(1);
    expect((await getZonePile(page))[0].cards).toHaveLength(3);
  });

  test('8. X X X with a still pointer discards three hand cards', async ({
    page,
  }) => {
    await seedZone(page);
    const handId = await seedHand(
      page,
      ['c1', 'c2', 'c3', 'c4', 'c5'].map((code) => ({
        code,
        homeZone: ZONE_ID,
      })),
    );

    // The hand re-centres after every discard; a point just right of the
    // container centre is over some card for every hand size down to one.
    const containerBox = await page.locator('.hand-panel__cards').boundingBox();
    const cardBox = await page
      .locator('.hand-panel__card')
      .nth(0)
      .boundingBox();
    if (!containerBox || !cardBox) throw new Error('No hand boxes');
    await page.mouse.move(
      containerBox.x + containerBox.width / 2 + 10,
      cardBox.y + cardBox.height / 2,
    );
    await expect(page.locator('.hand-panel__card--hovered')).toHaveCount(1);

    for (const remaining of [4, 3, 2]) {
      await page.keyboard.press('x');
      await expect
        .poll(() => getHandCodes(page, handId))
        .toHaveLength(remaining);
      // The pointer never moved: the card now under it carries the hover.
      await expect(page.locator('.hand-panel__card--hovered')).toHaveCount(1);
    }
    const pile = await getZonePile(page);
    expect(pile).toHaveLength(1);
    expect(pile[0].cards).toHaveLength(3);
  });

  test('9. X discards nothing once the pointer is over no card', async ({
    page,
  }) => {
    await seedZone(page);
    const handId = await seedHand(
      page,
      ['c1', 'c2', 'c3'].map((code) => ({ code, homeZone: ZONE_ID })),
    );

    const lastBox = await page
      .locator('.hand-panel__card')
      .nth(2)
      .boundingBox();
    if (!lastBox) throw new Error('No bounding box for hand card 2');
    // Over the last card's right edge: after one discard the hand shrinks
    // and re-centres, leaving this point over empty panel.
    await page.mouse.move(
      lastBox.x + lastBox.width - 4,
      lastBox.y + lastBox.height / 2,
    );
    await expect(page.locator('.hand-panel__card--hovered')).toHaveCount(1);

    await page.keyboard.press('x');
    await expect.poll(() => getHandCodes(page, handId)).toHaveLength(2);
    await expect(page.locator('.hand-panel__card--hovered')).toHaveCount(0);

    await page.keyboard.press('x');
    await page.waitForTimeout(300);
    expect(await getHandCodes(page, handId)).toHaveLength(2);
    expect((await getZonePile(page))[0].cards).toHaveLength(1);
  });

  test('10. hand change mid-drag never leaves X on the neighbour', async ({
    page,
  }) => {
    await seedZone(page);
    const handId = await seedHand(
      page,
      ['c1', 'c2', 'c3', 'c4', 'c5'].map((code) => ({
        code,
        homeZone: ZONE_ID,
      })),
    );

    const box1 = await page.locator('.hand-panel__card').nth(1).boundingBox();
    if (!box1) throw new Error('No bounding box for hand card 1');
    const y = box1.y + box1.height / 2;
    await page.mouse.move(box1.x + 6, y);
    await page.mouse.down();
    // Carry the card over a later slot, staying inside the hand row.
    const box3 = await page.locator('.hand-panel__card').nth(3).boundingBox();
    if (!box3) throw new Error('No bounding box for hand card 3');
    const px = box3.x + 6;
    await page.mouse.move(px, y, { steps: 8 });

    // The hand changes while the card is held (remote edit or a draw).
    await page.evaluate(
      ({ id, zone }) => {
        const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
        store.addCardToHand(id, { code: 'c6', homeZone: zone });
      },
      { id: handId, zone: ZONE_ID },
    );
    await expect.poll(() => getHandCodes(page, handId)).toHaveLength(6);

    await page.mouse.up();
    await expect(page.locator('.hand-panel__card')).toHaveCount(6);
    const before = await getHandCodes(page, handId);

    // Which card the pointer is over, read straight from the DOM.
    const underPointer = await page.evaluate(
      ({ px, py }) => {
        const hit = document
          .elementFromPoint(px, py)
          ?.closest('.hand-panel__card');
        if (!hit) return -1;
        return Array.from(
          document.querySelectorAll('.hand-panel__card'),
        ).indexOf(hit);
      },
      { px, py: y },
    );

    await page.keyboard.press('x');
    await page.waitForTimeout(300);
    const after = await getHandCodes(page, handId);
    const removed = before.filter((code) => !after.includes(code));
    // Nothing discarded, or exactly the card under the pointer.
    if (removed.length > 0) {
      expect(underPointer).toBeGreaterThanOrEqual(0);
      expect(removed).toEqual([before[underPointer]]);
    }
  });
});

test.describe('Hand card controls on touch (ct-3pj.4)', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 700 } });

  test('5. both controls stay in the visible strip; x never drags or double-taps', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedZone(page);
    const handId = await seedHand(
      page,
      Array.from({ length: 12 }, (_, i) => ({
        code: `c${i + 1}`,
        homeZone: ZONE_ID,
      })),
    );

    // Without card data the double-tap preview can never open, which would
    // make the "no preview" assertions below vacuous.
    await page.evaluate(() => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      const png =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';
      const cards: Record<string, { type: string; face: string }> = {};
      for (let i = 1; i <= 12; i++)
        cards[`c${i}`] = { type: 'default', face: png };
      store.setGameAssets({
        packs: [],
        cardTypes: { default: { size: 'standard', back: png } },
        cards,
        cardSets: {},
        tokens: {},
        counters: {},
        mats: {},
        tokenTypes: {},
        statusTypes: {},
        modifierStats: {},
        iconTypes: {},
      });
    });

    const card = page.locator('.hand-panel__card').nth(1);
    const playBtn = card.locator('.hand-panel__play-btn');
    const discardBtn = card.locator('.hand-panel__discard-btn');
    await expect(playBtn).toHaveCSS('opacity', '1');
    await expect(discardBtn).toHaveCSS('opacity', '1');

    const cardBox = await card.boundingBox();
    const playBox = await playBtn.boundingBox();
    const discardBox = await discardBtn.boundingBox();
    if (!cardBox || !playBox || !discardBox) throw new Error('Missing boxes');
    for (const box of [playBox, discardBox]) {
      expect(box.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + 36);
    }
    expect(discardBox.y - (playBox.y + playBox.height)).toBeGreaterThanOrEqual(
      16,
    );

    const preview = page.getByTestId('card-preview-modal');

    const centre = {
      x: discardBox.x + discardBox.width / 2,
      y: discardBox.y + discardBox.height / 2,
    };
    await page.touchscreen.tap(centre.x, centre.y);
    await expect.poll(() => getHandCodes(page, handId)).toHaveLength(11);
    expect((await getZonePile(page))[0].cards).toEqual(['c2']);
    await expect(preview).toHaveCount(0);

    await page.touchscreen.tap(centre.x, centre.y);
    await page.touchscreen.tap(centre.x, centre.y);
    await expect.poll(() => getHandCodes(page, handId)).toHaveLength(9);
    const pile = await getZonePile(page);
    expect(pile).toHaveLength(1);
    expect(pile[0].cards).toHaveLength(3);
    await expect(preview).toHaveCount(0);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x, centre.y - 20, { steps: 5 });
    await page.mouse.move(centre.x, centre.y - 40, { steps: 5 });
    // 40px up is still inside the hand panel (a reorder drop); go on until
    // the pointer is over the table.
    const panelBox = await page.locator('.hand-panel').boundingBox();
    if (!panelBox) throw new Error('No hand panel box');
    await page.mouse.move(centre.x, panelBox.y - 100, { steps: 10 });
    await page.mouse.up();
    expect(await getHandCodes(page, handId)).toHaveLength(9);
    await expect(page.locator('.hand-panel__card')).toHaveCount(9);
  });
});
