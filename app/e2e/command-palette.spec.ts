/**
 * E2E coverage for command palette ranking and touch scrolling (ct-eok.18).
 *
 * With a query the palette shows one list ranked across categories, with the
 * best label match first and highlighted so Enter runs it. The results list
 * must also scroll by real touch gestures at a phone viewport.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const DECK_ID = 'e2e-palette-deck';
const DECK_POS = { x: 0, y: -150 };

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<
    string,
    { _selectedBy: string | null; _faceUp?: boolean }
  >;
}

interface PageCtTest {
  click: (pt: { x: number; y: number }) => void;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: PageCtTest;
}

async function openTableWithSelectedDeck(page: Page): Promise<void> {
  await page.goto('/table/palette-ranking');
  const canvas = page.getByTestId('board-canvas');
  await expect(canvas).toHaveAttribute('data-canvas-initialized', 'true', {
    timeout: 10000,
  });
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as PageGlobals).__ctTest),
    { timeout: 10000 },
  );
  await page.evaluate(
    ({ id, pos }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject(id, {
        _kind: 'stack',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: id,
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: {},
        _cards: [{ code: 'c1' }, { code: 'c2' }, { code: 'c3' }],
        _faceUp: true,
      });
      (globalThis as unknown as PageGlobals).__ctTest!.click(pos);
    },
    { id: DECK_ID, pos: DECK_POS },
  );
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

function getFaceUp(page: Page): Promise<boolean | undefined> {
  return page.evaluate(
    (id) =>
      (globalThis as unknown as PageGlobals)
        .__TEST_STORE__!.getAllObjects()
        .get(id)?._faceUp,
    DECK_ID,
  );
}

test.describe('Command palette ranking', () => {
  test('exact label match is first and highlighted, and Enter runs it', async ({
    page,
  }) => {
    await openTableWithSelectedDeck(page);
    await page.keyboard.press('ControlOrMeta+k');

    const input = page.locator('input[placeholder*="Search"]').first();
    await expect(input).toBeVisible();
    await input.fill('flip');

    const options = page.locator('.command-palette-option');
    await expect(options.first()).toContainText('Flip Selected Objects');
    await expect(
      options.first().locator('.command-palette-option-content'),
    ).toHaveClass(/focus/);
    await expect(page.locator('.command-palette-section-title')).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect.poll(() => getFaceUp(page)).toBe(false);
  });
});

test.describe('Command palette on a phone', () => {
  test.use({ viewport: { width: 390, height: 420 }, hasTouch: true });

  test('results list fits above the on-screen keyboard and scrolls by touch', async ({
    page,
  }) => {
    await openTableWithSelectedDeck(page);
    await page.keyboard.press('ControlOrMeta+k');

    const list = page.locator('.command-palette-options');
    await expect(list).toBeVisible();

    const metrics = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    const box = await list.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.synthesizeScrollGesture', {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
      yDistance: -150,
      gestureSourceType: 'touch',
    });

    await expect
      .poll(() => list.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
  });
});
