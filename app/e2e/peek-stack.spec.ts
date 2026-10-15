/**
 * E2E coverage for peeking at the top N cards of a stack (ct-eok.5).
 *
 * Peek crosses canvas selection, the keyboard numeric prefix, the context
 * menu and its Peek submenu, a DOM modal with pointer drag, and the Yjs store,
 * so only a browser run shows them working together.
 *
 * Strategy:
 * - `/table/:id` route; decks are seeded through `__TEST_STORE__` (the fixture
 *   clears the store on navigation, so URL seeds cannot be used).
 * - Decks are selected with a canvas click (`__ctTest.click`); keys, mouse
 *   moves and drags are real input.
 * - Results are read from the store (`_cards` codes), not from pixels.
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const DECK_ID = 'e2e-peek-deck';
const DECK_POS = { x: 0, y: -150 };
const OTHER_ID = 'e2e-peek-deck-2';
const OTHER_POS = { x: -300, y: 50 };

interface StoreObject {
  _kind: string;
  _faceUp?: boolean;
  _pos: { x: number; y: number; r: number };
  _containerId?: string | null;
  _cards?: Array<{ code: string; homeZone?: string }>;
  _selectedBy: string | null;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  createHand: (name: string) => string;
  addCardToHand: (handId: string, card: { code: string }) => void;
  getHandIds: () => string[];
  getHandCards: (handId: string) => Array<{ code: string }>;
  getAllObjects: () => Map<string, StoreObject>;
}

interface PageCtTest {
  click: (pt: { x: number; y: number }) => void;
  worldToViewport: (pt: { x: number; y: number }) => { x: number; y: number };
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: PageCtTest;
}

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

async function openTable(page: Page, testId: string): Promise<void> {
  await page.goto(`/table/peek-${testId.replace(/[^a-z0-9]/gi, '-')}`);
  await waitForTableReady(page);
}

async function seedDeck(
  page: Page,
  codes: string[],
  faceUp = false,
  id = DECK_ID,
  pos = DECK_POS,
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

function getDeckCodes(page: Page, id = DECK_ID): Promise<string[]> {
  return page.evaluate((id) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return (store.getAllObjects().get(id)?._cards ?? []).map((c) => c.code);
  }, id);
}

function getFaceUp(page: Page, id = DECK_ID): Promise<boolean | undefined> {
  return page.evaluate((id) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return store.getAllObjects().get(id)?._faceUp;
  }, id);
}

function deckViewportPos(
  page: Page,
  world = DECK_POS,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (pos) =>
      (globalThis as unknown as PageGlobals).__ctTest!.worldToViewport(pos),
    world,
  );
}

function getSelected(page: Page): Promise<string | null> {
  return page.evaluate(
    (id) =>
      (globalThis as unknown as PageGlobals)
        .__TEST_STORE__!.getAllObjects()
        .get(id)?._selectedBy ?? null,
    DECK_ID,
  );
}

async function selectDeck(page: Page): Promise<void> {
  await page.evaluate((pt) => {
    (globalThis as unknown as PageGlobals).__ctTest!.click(pt);
  }, DECK_POS);
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (globalThis as unknown as PageGlobals)
            .__TEST_STORE__!.getAllObjects()
            .get(id)?._selectedBy ?? null,
        DECK_ID,
      ),
    )
    .not.toBeNull();
}

/** Seed a deck and select it, ready for a peek. */
async function setupDeck(page: Page, codes: string[]): Promise<void> {
  await seedDeck(page, codes);
  await selectDeck(page);
}

/** Keys that open a peek of the top `n` cards (no prefix when `n` is omitted). */
async function pressPeek(page: Page, n?: number): Promise<void> {
  if (n !== undefined) await page.keyboard.press(String(n));
  await page.keyboard.press('p');
}

function peekCodes(page: Page): Promise<string[]> {
  return page
    .getByTestId('peek-card')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-code') ?? ''));
}

async function expectPeekCodes(page: Page, codes: string[]): Promise<void> {
  await expect(page.getByTestId('peek-modal')).toBeVisible();
  await expect.poll(() => peekCodes(page)).toEqual(codes);
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Pointer-drag the peek card at `from` onto the slot of the card at `to`. */
async function dragPeekCard(
  page: Page,
  from: number,
  to: number,
): Promise<void> {
  const cards = page.getByTestId('peek-card');
  const start = await centerOf(cards.nth(from));
  const end = await centerOf(cards.nth(to));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * i) / steps,
      start.y + ((end.y - start.y) * i) / steps,
    );
  }
  await page.mouse.up();
}

async function rightClickDeck(page: Page, world = DECK_POS): Promise<void> {
  const pos = await deckViewportPos(page, world);
  // A just-seeded object may not be hit-testable yet; retry the right-click.
  await expect(async () => {
    await page.mouse.click(pos.x, pos.y, { button: 'right' });
    await expect(openMenu(page)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10000 });
}

const openMenu = (page: Page) => page.locator('.context-menu').first();
const peekRow = (page: Page) =>
  page.getByTestId('context-menu-item-peek-stack');
const submenuItem = (page: Page, variant: string) =>
  page.getByTestId(`context-submenu-item-peek-stack-${variant}`);

test.describe('Peek at the top of a stack', () => {
  test('dragging a card and clicking Done reorders the top of the deck', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await setupDeck(page, ['A', 'B', 'C', 'D', 'E']);

    await pressPeek(page, 3);
    await expectPeekCodes(page, ['A', 'B', 'C']);

    await dragPeekCard(page, 2, 0);
    await expectPeekCodes(page, ['C', 'A', 'B']);
    expect(await getDeckCodes(page)).toEqual(['A', 'B', 'C', 'D', 'E']);

    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    await expect
      .poll(() => getDeckCodes(page))
      .toEqual(['C', 'A', 'B', 'D', 'E']);
  });

  test('P with no numeric prefix shows the default 3 cards', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await setupDeck(page, ['A', 'B', 'C', 'D', 'E']);

    await pressPeek(page);
    await expectPeekCodes(page, ['A', 'B', 'C']);
  });

  test('Cancel and Escape leave the deck unchanged', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await setupDeck(page, ['A', 'B', 'C', 'D', 'E']);
    const original = ['A', 'B', 'C', 'D', 'E'];

    await pressPeek(page, 3);
    await expectPeekCodes(page, ['A', 'B', 'C']);
    await dragPeekCard(page, 2, 0);
    await expectPeekCodes(page, ['C', 'A', 'B']);
    await page.getByTestId('peek-cancel').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    expect(await getDeckCodes(page)).toEqual(original);

    await pressPeek(page, 3);
    await expectPeekCodes(page, ['A', 'B', 'C']);
    await dragPeekCard(page, 2, 0);
    await expectPeekCodes(page, ['C', 'A', 'B']);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    expect(await getDeckCodes(page)).toEqual(original);
  });

  test('Done after the deck changed underneath writes nothing and toasts', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await setupDeck(page, ['A', 'B', 'C', 'D', 'E']);

    await pressPeek(page, 3);
    await expectPeekCodes(page, ['A', 'B', 'C']);

    await seedDeck(page, ['Z', 'A', 'B', 'C', 'D', 'E']);
    await dragPeekCard(page, 2, 0);
    await page.getByTestId('peek-done').click();

    await expect(
      page.getByRole('status').filter({ hasText: /deck changed/i }),
    ).toBeVisible();
    expect(await getDeckCodes(page)).toEqual(['Z', 'A', 'B', 'C', 'D', 'E']);
  });

  test('right-click Peek submenu Top 5 opens a 5-card peek; Done is a no-op', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    const codes = ['A', 'B', 'C', 'D', 'E', 'F'];
    await seedDeck(page, codes);

    await rightClickDeck(page);
    await peekRow(page).click();
    await submenuItem(page, 'top-5').click();

    await expectPeekCodes(page, ['A', 'B', 'C', 'D', 'E']);
    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    expect(await getDeckCodes(page)).toEqual(codes);
  });

  test('submenu opens on hover, closes on another row, survives a diagonal move', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C', 'D', 'E', 'F']);

    await rightClickDeck(page);
    await peekRow(page).hover();
    for (const v of ['top-1', 'top-3', 'top-5', 'top-10']) {
      await expect(submenuItem(page, v)).toBeVisible();
    }

    await page
      .locator('.context-menu-item')
      .filter({ hasText: 'Shuffle' })
      .first()
      .hover();
    await expect(submenuItem(page, 'top-3')).toHaveCount(0);

    await peekRow(page).hover();
    await expect(submenuItem(page, 'top-3')).toBeVisible();
    const from = await centerOf(peekRow(page));
    const to = await centerOf(submenuItem(page, 'top-3'));
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * i) / steps,
        from.y + ((to.y - from.y) * i) / steps,
      );
      await expect(submenuItem(page, 'top-3')).toBeVisible();
    }
    await submenuItem(page, 'top-3').click();
    await expectPeekCodes(page, ['A', 'B', 'C']);
    await page.getByTestId('peek-cancel').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
  });

  test('submenu keyboard navigation', async ({ page }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C', 'D', 'E', 'F']);

    await rightClickDeck(page);
    await peekRow(page).focus();

    await page.keyboard.press('ArrowRight');
    await expect(submenuItem(page, 'top-1')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(submenuItem(page, 'top-3')).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(submenuItem(page, 'top-3')).toHaveCount(0);
    await expect(peekRow(page)).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(submenuItem(page, 'top-5')).toBeFocused();
    await page.keyboard.press('Enter');
    await expectPeekCodes(page, ['A', 'B', 'C', 'D', 'E']);
    await page.getByTestId('peek-cancel').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);

    await rightClickDeck(page);
    await peekRow(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(submenuItem(page, 'top-1')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(submenuItem(page, 'top-1')).toHaveCount(0);
    await expect(openMenu(page)).toBeVisible();
    await expect(peekRow(page)).toBeFocused();
  });
});

test.describe('Context menu regressions (programmatic open)', () => {
  test('clicking outside closes the menu and does not run anything', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C']);
    await rightClickDeck(page);
    await page.mouse.click(1100, 300);
    await expect(page.locator('.context-menu')).toHaveCount(0);
    expect(await getDeckCodes(page)).toEqual(['A', 'B', 'C']);
    expect(await getFaceUp(page)).toBe(false);
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
  });

  test('shortcuts still work after the menu closes', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C', 'D']);
    await rightClickDeck(page);
    await expect.poll(() => getSelected(page)).not.toBeNull();
    await page.mouse.click(1100, 300);
    await expect(page.locator('.context-menu')).toHaveCount(0);

    await pressPeek(page, 2);
    await expectPeekCodes(page, ['A', 'B']);
    await page.getByTestId('peek-cancel').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);

    await page.keyboard.press('f');
    await expect.poll(() => getFaceUp(page)).toBe(true);
  });

  test('right-click on another object while open, and after close, reopens at the new spot', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C']);
    await seedDeck(page, ['X', 'Y'], false, OTHER_ID, OTHER_POS);

    await rightClickDeck(page);
    const first = await openMenu(page).boundingBox();

    // The backdrop's contextmenu handler closes the open menu.
    const other = await deckViewportPos(page, OTHER_POS);
    await page.mouse.click(other.x, other.y, { button: 'right' });
    await expect(page.locator('.context-menu')).toHaveCount(0);

    await rightClickDeck(page, OTHER_POS);
    const second = await openMenu(page).boundingBox();
    expect(second?.x).not.toBe(first?.x);
    await expect(peekRow(page)).toBeVisible();

    await page.mouse.click(1100, 300);
    await expect(page.locator('.context-menu')).toHaveCount(0);
    await rightClickDeck(page);
    const third = await openMenu(page).boundingBox();
    expect(third?.x).toBe(first?.x);
    await expect(peekRow(page)).toBeVisible();
  });

  test('mouse click runs a normal row; clicking Peek opens the submenu without highlighting Top 1', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C', 'D', 'E']);

    await rightClickDeck(page);
    await peekRow(page).click();
    await expect(submenuItem(page, 'top-1')).toBeVisible();
    await expect(submenuItem(page, 'top-1')).not.toBeFocused();

    await page
      .locator('.context-menu-item')
      .filter({ hasText: 'Flip Selected Objects' })
      .click();
    await expect(page.locator('.context-menu')).toHaveCount(0);
    await expect.poll(() => getFaceUp(page)).toBe(true);
  });

  test('reopening the menu after choosing a variant shows no stale submenu', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C', 'D', 'E']);
    await rightClickDeck(page);
    await peekRow(page).hover();
    await submenuItem(page, 'top-3').click();
    await page.getByTestId('peek-cancel').click();

    await rightClickDeck(page);
    await expect(openMenu(page)).toBeVisible();
    await expect(submenuItem(page, 'top-3')).toHaveCount(0);
  });
});

// Ring 1 (ct-eok.6.4): per-card destinations, Custom N, whole-stack peek.
// Drafted against ct-eok.6.1/6.2/6.3; selectors for peek-dest are confirmed
// once those land.

const ZONE_ID = 'e2e-peek-zone';
const ZONE_POS = { x: 420, y: 0 };
type Dest = 'top' | 'bottom' | 'hand' | 'table' | 'discard';

interface Entry {
  code: string;
  homeZone?: string;
}

async function seedDiscardZone(page: Page): Promise<void> {
  await page.evaluate(
    ({ id, pos }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject(id, {
        _kind: 'zone',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: id,
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { isDiscardZone: true, label: 'Discard' },
      });
    },
    { id: ZONE_ID, pos: ZONE_POS },
  );
}

async function seedEntries(page: Page, entries: Entry[]): Promise<void> {
  await page.evaluate(
    ({ id, pos, entries }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject(id, {
        _kind: 'stack',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: id,
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: entries,
        _faceUp: false,
      });
    },
    { id: DECK_ID, pos: DECK_POS, entries },
  );
}

interface Snap {
  id: string;
  kind: string;
  pos: { x: number; y: number };
  cards: string[];
  faceUp: boolean | undefined;
  containerId: string | null | undefined;
}

function snapshotAll(page: Page): Promise<Snap[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries()).map(([id, o]) => ({
      id,
      kind: o._kind,
      pos: { x: o._pos.x, y: o._pos.y },
      cards: (o._cards ?? []).map((c) => c.code),
      faceUp: o._faceUp,
      containerId: o._containerId,
    }));
  });
}

function handCodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    const [first] = store.getHandIds();
    return first ? store.getHandCards(first).map((c) => c.code) : [];
  });
}

const peekCard = (page: Page, code: string) =>
  page.locator(`[data-testid="peek-card"][data-code="${code}"]`);

/** The slot wrapping a peeked card and its destination select. */
const peekSlot = (page: Page, code: string) =>
  page.getByTestId('peek-slot').filter({ has: peekCard(page, code) });

async function setDest(page: Page, code: string, dest: Dest): Promise<void> {
  await peekSlot(page, code).getByTestId('peek-dest').selectOption(dest);
}

function discardOption(page: Page, code: string): Locator {
  return peekSlot(page, code)
    .getByTestId('peek-dest')
    .locator('option[value="discard"]');
}

test.describe('Peek per-card destinations (Ring 1)', () => {
  test('mixed destinations land in deck, hand, table and discard pile', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDiscardZone(page);
    await seedEntries(
      page,
      ['A', 'B', 'C', 'D', 'E', 'F'].map((code) => ({
        code,
        homeZone: ZONE_ID,
      })),
    );
    await selectDeck(page);

    await pressPeek(page, 5);
    await expectPeekCodes(page, ['A', 'B', 'C', 'D', 'E']);
    await setDest(page, 'A', 'bottom');
    await setDest(page, 'B', 'hand');
    await setDest(page, 'C', 'table');
    await setDest(page, 'D', 'discard');
    await setDest(page, 'E', 'top');
    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);

    await expect.poll(() => getDeckCodes(page)).toEqual(['E', 'F', 'A']);
    await expect.poll(() => handCodes(page).then((c) => c.at(-1))).toBe('B');

    const all = await snapshotAll(page);
    const tableStack = all.find(
      (o) => o.kind === 'stack' && o.id !== DECK_ID && o.cards.join() === 'C',
    );
    expect(tableStack?.faceUp).toBe(true);
    expect(tableStack!.pos.y).toBeGreaterThan(DECK_POS.y);
    const pile = all.find(
      (o) => o.kind === 'stack' && o.containerId === ZONE_ID,
    );
    expect(pile?.cards[0]).toBe('D');
  });

  test('Discard is disabled for cards without a home zone', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await setupDeck(page, ['A', 'B', 'C', 'D', 'E']);

    await pressPeek(page, 3);
    await expectPeekCodes(page, ['A', 'B', 'C']);
    for (const code of ['A', 'B', 'C']) {
      await expect(discardOption(page, code)).toBeDisabled();
    }
  });

  test('Other… asks for N, then peeks with no in-window N box', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    await seedDeck(page, codes);

    await rightClickDeck(page);
    await peekRow(page).click();
    await submenuItem(page, 'other').click();

    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    await expect(page.getByTestId('peek-count-input')).toBeFocused();
    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('peek-count-dialog')).toHaveCount(0);
    await expectPeekCodes(page, codes.slice(0, 5));
    await expect(page.getByTestId('peek-n-input')).toHaveCount(0);

    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    expect(await getDeckCodes(page)).toEqual(codes);
  });

  test('a window opened with Top N keeps the N box, which clamps to the stack size', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    await seedDeck(page, codes);

    await rightClickDeck(page);
    await peekRow(page).click();
    await submenuItem(page, 'top-3').click();
    await expectPeekCodes(page, codes.slice(0, 3));

    await page.getByTestId('peek-n-input').fill('20');
    await page.keyboard.press('Enter');
    await expectPeekCodes(page, codes);

    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    expect(await getDeckCodes(page)).toEqual(codes);
  });

  test('Shuffle bottom is disabled with no Bottom card; ticked, it shuffles only the bottom group', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await setupDeck(page, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

    await pressPeek(page, 5);
    await expectPeekCodes(page, ['A', 'B', 'C', 'D', 'E']);
    const shuffleBottom = page.getByTestId('peek-shuffle-bottom');
    await expect(shuffleBottom).toBeDisabled();
    await expect(page.getByTestId('peek-shuffle-top')).toBeEnabled();

    await setDest(page, 'A', 'bottom');
    await setDest(page, 'B', 'bottom');
    await expect(shuffleBottom).toBeEnabled();
    await expect(shuffleBottom).not.toBeChecked();
    await shuffleBottom.check();
    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);

    await expect
      .poll(() => getDeckCodes(page).then((c) => c.slice(0, 6)))
      .toEqual(['C', 'D', 'E', 'F', 'G', 'H']);
    const deck = await getDeckCodes(page);
    expect(deck.slice(6).sort()).toEqual(['A', 'B']);
  });

  test('Esc in the Other… number dialog opens no peek window', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await seedDeck(page, ['A', 'B', 'C', 'D']);

    await rightClickDeck(page);
    await peekRow(page).click();
    await submenuItem(page, 'other').click();
    await expect(page.getByTestId('peek-count-dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('peek-count-dialog')).toHaveCount(0);
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
  });

  test('sending the whole stack to hand deletes the deck and keeps order', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    await setupDeck(page, ['A', 'B', 'C']);

    await pressPeek(page, 3);
    await expectPeekCodes(page, ['A', 'B', 'C']);
    for (const code of ['A', 'B', 'C']) await setDest(page, code, 'hand');
    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);

    await expect.poll(() => handCodes(page)).toEqual(['A', 'B', 'C']);
    const all = await snapshotAll(page);
    expect(all.find((o) => o.id === DECK_ID)).toBeUndefined();
  });

  test('Done applies the current peek even with an uncommitted N edit', async ({
    page,
  }, testInfo) => {
    await openTable(page, testInfo.testId);
    const codes = ['A', 'B', 'C', 'D', 'E', 'F'];
    await seedDeck(page, codes);

    await rightClickDeck(page);
    await peekRow(page).click();
    await submenuItem(page, 'top-3').click();
    await expectPeekCodes(page, ['A', 'B', 'C']);
    await dragPeekCard(page, 2, 0);
    await expectPeekCodes(page, ['C', 'A', 'B']);

    await page.getByTestId('peek-n-input').fill('5');
    await page.getByTestId('peek-done').click();
    await expect(page.getByTestId('peek-modal')).toHaveCount(0);
    await expect
      .poll(() => getDeckCodes(page))
      .toEqual(['C', 'A', 'B', 'D', 'E', 'F']);
  });
});
