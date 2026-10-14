/**
 * E2E for ct-iwo.9: an exhaust pressed just before a drag is released must
 * survive the drop.
 *
 * The drop's objects-moved message carries a whole {x, y, r} copied from the
 * renderer's own copy of the card. A rotation saved after that copy was last
 * refreshed used to be written back by the drop; a drag never changes
 * rotation, so the drop now takes only x and y.
 */

import { test, expect, skipNextAutoClear } from './_fixtures';

interface Pos {
  x: number;
  y: number;
  r: number;
}

interface PageGlobals {
  __TEST_STORE__?: {
    getAllObjects: () => Map<
      string,
      { _pos: Pos; _selectedBy?: string | null }
    >;
  };
  __ctTest?: {
    pointerDown: (pt: { x: number; y: number }) => void;
    pointerMove: (pt: { x: number; y: number }) => void;
    pointerUp: (pt: { x: number; y: number }) => void;
    click: (pt: { x: number; y: number }) => void;
  };
}

const DRAG_DISTANCE = 150;

test('exhaust pressed just before a drag is released survives the drop', async ({
  page,
}) => {
  const tableId = `exhaust-drag-${test.info().testId.replace(/[^a-z0-9]/gi, '-')}`;
  // The seed populates the store at mount; the fixture's auto-clear would race it.
  skipNextAutoClear(page);
  await page.goto(`/table/${tableId}?seed=stack-of-5`);

  const canvas = page.getByTestId('board-canvas');
  await expect(canvas).toBeVisible({ timeout: 10000 });
  await expect(canvas).toHaveAttribute('data-canvas-initialized', 'true', {
    timeout: 10000,
  });
  await page.waitForFunction(
    () => {
      const g = globalThis as unknown as PageGlobals;
      return (
        Boolean(g.__ctTest) && g.__TEST_STORE__?.getAllObjects().size === 1
      );
    },
    { timeout: 10000 },
  );

  const start = await page.evaluate(() => {
    const g = globalThis as unknown as PageGlobals;
    const [id, obj] = Array.from(
      g.__TEST_STORE__!.getAllObjects().entries(),
    )[0];
    return { id, pos: obj._pos };
  });

  await page.evaluate((pos) => {
    (globalThis as unknown as PageGlobals).__ctTest!.click(pos);
  }, start.pos);
  await page.waitForFunction(
    (id) => {
      const g = globalThis as unknown as PageGlobals;
      return Boolean(g.__TEST_STORE__!.getAllObjects().get(id)?._selectedBy);
    },
    start.id,
    { timeout: 5000 },
  );

  // Drag and press E in ONE page task so the exhaust lands before the drop's
  // objects-moved message is processed.
  await page.evaluate(
    ({ pos, distance }) => {
      const ct = (globalThis as unknown as PageGlobals).__ctTest!;
      ct.pointerDown(pos);
      ct.pointerMove({ x: pos.x + 50, y: pos.y });
      ct.pointerMove({ x: pos.x + distance, y: pos.y });
      ct.pointerUp({ x: pos.x + distance, y: pos.y });
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'e',
          code: 'KeyE',
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { pos: start.pos, distance: DRAG_DISTANCE },
  );

  const readPos = (): Promise<Pos> =>
    page.evaluate(
      (id) =>
        (globalThis as unknown as PageGlobals)
          .__TEST_STORE__!.getAllObjects()
          .get(id)!._pos,
      start.id,
    );

  await expect
    .poll(async () => (await readPos()).x, { timeout: 5000 })
    .toBe(start.pos.x + DRAG_DISTANCE);
  expect((await readPos()).r).toBe(90);
});
