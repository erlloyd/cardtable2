/**
 * Loop-closing E2E for per-card home-zone discard routing (ct-1mv.8).
 *
 * Unit tests prove the store functions. This spec proves the real action path
 * (Create Discard Zone via the command palette, keyboard A / S / X through the
 * ActionRegistry, hand panel drag, board merge drag) carries the homeZone tag
 * on every card entry and that the no-home toast is actually raised.
 *
 * - Scenario A: two zones whose decks share a card code, round-trip through
 *   the hand and a merge, then discard routes each copy to its own zone.
 * - Scenario B: an untagged card raises the no-home toast and does not move.
 * - Scenario C: an encounter card shuffled into a player deck keeps its tag.
 *
 * Seeding initial stacks goes through __TEST_STORE__; every action under test
 * is driven through the UI. Route: /table/:id (the HandPanel route). That
 * route does not expose __TEST_BOARD__, so selection is awaited by polling
 * `_selectedBy` in the store.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface CardEntry {
  code: string;
  homeZone?: string;
}

interface Point {
  x: number;
  y: number;
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
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: {
    click: (pt: Point) => void;
    drag: (
      from: Point,
      to: Point,
      opts?: { steps?: number; stepDelayMs?: number },
    ) => Promise<void>;
  };
}

/** Unstack handle centre relative to a stack centre (STACK_WIDTH 63, HEIGHT 88, BADGE 18). */
const HANDLE_OFFSET: Point = { x: 63 / 2 - 18 / 2, y: -88 / 2 + 18 / 2 };

interface Snapshot {
  id: string;
  kind: string;
  pos: { x: number; y: number; r: number };
  cards: CardEntry[];
  faceUp: boolean | undefined;
  containerId: string | null | undefined;
  selectedBy: string | null | undefined;
}

async function openTable(page: Page, testId: string): Promise<void> {
  const tableId = `dhz-${testId.replace(/[^a-z0-9]/gi, '-')}`;
  await page.goto(`/table/${tableId}`);
  const canvas = page.getByTestId('board-canvas');
  await expect(canvas).toBeVisible({ timeout: 10000 });
  await expect(canvas).toHaveAttribute('data-canvas-initialized', 'true', {
    timeout: 10000,
  });
  await page.waitForFunction(
    () => {
      const g = globalThis as unknown as PageGlobals;
      return Boolean(g.__ctTest) && Boolean(g.__TEST_STORE__);
    },
    { timeout: 10000 },
  );
  await expect(page.locator('.hand-panel')).toBeVisible({ timeout: 10000 });
}

async function seedStack(
  page: Page,
  id: string,
  pos: Point,
  cards: CardEntry[],
): Promise<void> {
  await page.evaluate(
    ({ id, pos, cards }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject(id, {
        _kind: 'stack',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: id,
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: cards,
        _faceUp: false,
      });
    },
    { id, pos, cards },
  );
}

function snapshot(page: Page): Promise<Snapshot[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries()).map(([id, obj]) => ({
      id,
      kind: obj._kind,
      pos: obj._pos,
      cards: obj._cards ?? [],
      faceUp: obj._faceUp,
      containerId: obj._containerId,
      selectedBy: obj._selectedBy,
    }));
  });
}

async function getObject(page: Page, id: string): Promise<Snapshot> {
  const found = (await snapshot(page)).find((o) => o.id === id);
  if (!found) throw new Error(`object ${id} not found`);
  return found;
}

/** Canvas-click `pt` and wait until `id` is the selected object. */
async function selectAt(page: Page, pt: Point, id: string): Promise<void> {
  await page.evaluate((p) => {
    (globalThis as unknown as PageGlobals).__ctTest!.click(p);
  }, pt);
  await expect
    .poll(async () => (await getObject(page, id)).selectedBy ?? null)
    .not.toBeNull();
}

/** Select the stack and run Create Discard Zone from the command palette. */
async function createDiscardZone(
  page: Page,
  pt: Point,
  stackId: string,
): Promise<string> {
  const zoneIds = async (): Promise<string[]> =>
    (await snapshot(page)).filter((o) => o.kind === 'zone').map((o) => o.id);
  const before = await zoneIds();
  await selectAt(page, pt, stackId);
  await page.click('button[aria-label="Open command palette"]');
  await expect(
    page.locator('input[placeholder*="Search"]').first(),
  ).toBeVisible({ timeout: 2000 });
  await page.keyboard.type('discard zone');
  await page
    .locator('.command-palette-label')
    .filter({ hasText: /Create Discard Zone/i })
    .click();
  await expect(page.locator('.command-palette-panel')).toHaveCount(0);
  await expect
    .poll(async () => (await zoneIds()).length)
    .toBe(before.length + 1);
  return (await zoneIds()).filter((id) => !before.includes(id))[0];
}

/** Mouse-drag the first hand card onto the board at world point `world`. */
async function dragHandCardToBoard(page: Page, world: Point): Promise<void> {
  const box = await page.locator('.hand-panel__card').first().boundingBox();
  if (!box) throw new Error('No bounding box for hand card');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const canvasBox = await page.getByTestId('board-canvas').boundingBox();
  if (!canvasBox) throw new Error('Canvas bounding box not available');
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  const drop = {
    x: canvasBox.x + canvasBox.width / 2 + world.x / dpr,
    y: canvasBox.y + canvasBox.height / 2 + world.y / dpr,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y - 10, { steps: 3 });
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  // The renderer reports the board-space drop position asynchronously.
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/** Drag the stack at world `from` onto world `to` (merge on drop). */
async function dragStackOnto(
  page: Page,
  from: Point,
  to: Point,
): Promise<void> {
  await page.evaluate(
    async ({ from, to }) => {
      await (globalThis as unknown as PageGlobals).__ctTest!.drag(from, to, {
        steps: 10,
        stepDelayMs: 30,
      });
    },
    { from, to },
  );
}

/** Face-up stacks contained by a discard zone. */
async function pilesIn(page: Page, zoneId: string): Promise<Snapshot[]> {
  return (await snapshot(page)).filter(
    (o) => o.kind === 'stack' && o.containerId === zoneId,
  );
}

/**
 * Press 'x' once on the selected stack and wait for the discard to land.
 *
 * `remainingAfter` is the number of cards that stay in the loose stack. With 0
 * remaining, discardCardToZone (YjsActions.ts:1349-1352, 1371-1374) does not
 * move a card: the single-card stack itself is moved into the zone and gets
 * `_containerId` (it becomes the pile), or is merged into an existing pile and
 * deleted. Both are accepted explicitly here.
 */
async function discardOnce(
  page: Page,
  stackId: string,
  remainingAfter: number,
): Promise<void> {
  await page.keyboard.press('x');
  if (remainingAfter > 0) {
    await expect
      .poll(async () => {
        const stack = (await snapshot(page)).find((o) => o.id === stackId);
        return stack?.containerId === null ? stack.cards.length : -1;
      })
      .toBe(remainingAfter);
    await expect
      .poll(async () => (await getObject(page, stackId)).selectedBy ?? null)
      .not.toBeNull();
    return;
  }
  await expect
    .poll(async () => {
      const stack = (await snapshot(page)).find((o) => o.id === stackId);
      return stack === undefined || stack.containerId !== null;
    })
    .toBe(true);
}

/** Press 'x' `times` times on the selected stack. */
async function discardAll(
  page: Page,
  stackId: string,
  times: number,
): Promise<void> {
  for (let left = times - 1; left >= 0; left--) {
    await discardOnce(page, stackId, left);
  }
}

test.describe('Discard home zone — per-card routing (ct-1mv.8)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openTable(page, testInfo.testId);
  });

  test('A. shared code across two zones: hand + merge round-trip routes each copy home', async ({
    page,
  }) => {
    const P = { x: -300, y: -100 };
    const Q = { x: 300, y: -100 };
    const DROP = { x: 0, y: -100 };
    await seedStack(page, 'deck-p', P, [{ code: 'dup' }, { code: 'p1' }]);
    await seedStack(page, 'deck-q', Q, [{ code: 'dup' }, { code: 'q1' }]);
    await expect.poll(async () => (await snapshot(page)).length).toBe(2);

    const zoneP = await createDiscardZone(page, P, 'deck-p');
    const zoneQ = await createDiscardZone(page, Q, 'deck-q');
    expect(zoneP).not.toBe(zoneQ);
    expect((await getObject(page, 'deck-p')).cards).toEqual([
      { code: 'dup', homeZone: zoneP },
      { code: 'p1', homeZone: zoneP },
    ]);
    expect((await getObject(page, 'deck-q')).cards).toEqual([
      { code: 'dup', homeZone: zoneQ },
      { code: 'q1', homeZone: zoneQ },
    ]);

    // P's top card goes to the hand via the 'a' shortcut.
    await selectAt(page, P, 'deck-p');
    await page.keyboard.press('a');
    await expect(page.locator('.hand-panel__card')).toHaveCount(1);
    expect((await getObject(page, 'deck-p')).cards).toEqual([
      { code: 'p1', homeZone: zoneP },
    ]);

    // Drag the hand card onto an empty board spot: the new stack keeps the tag.
    await dragHandCardToBoard(page, DROP);
    await expect(page.locator('.hand-panel__card')).toHaveCount(0);
    const isHandStack = (o: Snapshot): boolean =>
      o.kind === 'stack' && o.id !== 'deck-p' && o.id !== 'deck-q';
    await expect
      .poll(async () => (await snapshot(page)).filter(isHandStack).length)
      .toBe(1);
    const handStack = (await snapshot(page)).filter(isHandStack)[0];
    expect(handStack.cards).toEqual([{ code: 'dup', homeZone: zoneP }]);

    // Pull ONE card off deck Q by dragging its unstack handle (top-right corner,
    // pointer.ts isPointInUnstackHandle), dropping the new stack onto the hand
    // stack. The new stack is created centred on the cursor, so dropping at the
    // hand stack's position merges it.
    const handle = { x: Q.x + HANDLE_OFFSET.x, y: Q.y + HANDLE_OFFSET.y };
    await dragStackOnto(page, handle, handStack.pos);
    await expect
      .poll(async () => (await getObject(page, handStack.id)).cards.length)
      .toBe(2);
    expect((await getObject(page, 'deck-q')).cards).toEqual([
      { code: 'q1', homeZone: zoneQ },
    ]);
    const merged = (await getObject(page, handStack.id)).cards;
    expect(merged).toEqual([
      { code: 'dup', homeZone: zoneQ },
      { code: 'dup', homeZone: zoneP },
    ]);

    // First 'x' sends the top card (Q's) to zoneQ, leaving P's dup loose.
    await selectAt(page, handStack.pos, handStack.id);
    await discardOnce(page, handStack.id, 1);
    expect((await getObject(page, handStack.id)).cards).toEqual([
      { code: 'dup', homeZone: zoneP },
    ]);
    expect(await pilesIn(page, zoneP)).toHaveLength(0);
    const pilesQ = await pilesIn(page, zoneQ);
    expect(pilesQ).toHaveLength(1);
    expect(pilesQ[0].faceUp).toBe(true);
    expect(pilesQ[0].cards).toEqual([{ code: 'dup', homeZone: zoneQ }]);

    // Second 'x': the loose stack holds one card and zoneP is empty, so the
    // stack itself becomes zoneP's pile (same id, containerId set).
    await discardOnce(page, handStack.id, 0);
    const pilesP = await pilesIn(page, zoneP);
    expect(pilesP).toHaveLength(1);
    expect(pilesP[0].id).toBe(handStack.id);
    expect(pilesP[0].faceUp).toBe(true);
    expect(pilesP[0].cards).toEqual([{ code: 'dup', homeZone: zoneP }]);
    expect(await pilesIn(page, zoneQ)).toHaveLength(1);
  });

  test('B. untagged card: toast names the missing zone and nothing moves', async ({
    page,
  }) => {
    const AT = { x: 0, y: -100 };
    await seedStack(page, 'orphan-stack', AT, [{ code: 'orphan' }]);
    await expect.poll(async () => (await snapshot(page)).length).toBe(1);
    await selectAt(page, AT, 'orphan-stack');

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

    const stack = await getObject(page, 'orphan-stack');
    expect(stack.cards).toEqual([{ code: 'orphan' }]);
    expect(stack.containerId).toBeNull();
    expect(stack.pos).toEqual({ ...AT, r: 0 });
    expect(
      (await snapshot(page)).filter((o) => o.kind === 'zone'),
    ).toHaveLength(0);
  });

  test('C. encounter card shuffled into a player deck still discards to its own zone', async ({
    page,
  }) => {
    const E = { x: -300, y: -100 };
    const P = { x: 300, y: -100 };
    await seedStack(page, 'deck-e', E, [{ code: 'e1' }]);
    await seedStack(page, 'deck-p', P, [{ code: 'p1' }, { code: 'p2' }]);
    await expect.poll(async () => (await snapshot(page)).length).toBe(2);

    const zoneE = await createDiscardZone(page, E, 'deck-e');
    const zoneP = await createDiscardZone(page, P, 'deck-p');

    // Merge the encounter card into the player deck, then shuffle it.
    await dragStackOnto(page, E, P);
    await expect
      .poll(async () => (await snapshot(page)).find((o) => o.id === 'deck-e'))
      .toBeUndefined();
    const merged = (await getObject(page, 'deck-p')).cards;
    expect(merged).toHaveLength(3);
    expect(merged).toContainEqual({ code: 'e1', homeZone: zoneE });

    await selectAt(page, P, 'deck-p');
    await page.keyboard.press('s');
    await discardAll(page, 'deck-p', 3);

    const pilesE = await pilesIn(page, zoneE);
    const pilesP = await pilesIn(page, zoneP);
    expect(pilesE).toHaveLength(1);
    expect(pilesP).toHaveLength(1);
    expect(pilesE[0].cards).toEqual([{ code: 'e1', homeZone: zoneE }]);
    expect(pilesP[0].cards).toHaveLength(2);
    expect(pilesP[0].cards).toContainEqual({ code: 'p1', homeZone: zoneP });
    expect(pilesP[0].cards).toContainEqual({ code: 'p2', homeZone: zoneP });
  });
});
