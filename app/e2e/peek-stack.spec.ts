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

interface StoreObject {
  _kind: string;
  _cards?: Array<{ code: string }>;
  _selectedBy: string | null;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
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
    { id: DECK_ID, pos: DECK_POS, codes, faceUp },
  );
}

function getDeckCodes(page: Page): Promise<string[]> {
  return page.evaluate((id) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return (store.getAllObjects().get(id)?._cards ?? []).map((c) => c.code);
  }, DECK_ID);
}

function deckViewportPos(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (pos) =>
      (globalThis as unknown as PageGlobals).__ctTest!.worldToViewport(pos),
    DECK_POS,
  );
}

async function selectDeck(page: Page): Promise<void> {
  const pos = await deckViewportPos(page);
  await page.evaluate((pt) => {
    (globalThis as unknown as PageGlobals).__ctTest!.click(pt);
  }, pos);
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

async function rightClickDeck(page: Page): Promise<void> {
  const pos = await deckViewportPos(page);
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await expect(page.locator('.context-menu')).toBeVisible({ timeout: 5000 });
}

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
      page.getByRole('alert').filter({ hasText: /deck changed/i }),
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
    for (let i = 0; i < 20; i++) {
      if (await peekRow(page).evaluate((el) => el.classList.contains('focus')))
        break;
      await page.keyboard.press('ArrowDown');
    }
    await expect(peekRow(page)).toHaveClass(/focus/);

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
    await expect(page.locator('.context-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.context-menu')).toHaveCount(0);
  });
});
