/**
 * E2E tests for object lock (ct-623.7): L locks the selection and Shift+L
 * unlocks it. A locked object ignores a direct drag and is left behind when
 * its zone is dragged; a locked zone ignores a drag by its label but cards
 * inside it can still be dragged out.
 *
 * Strategy:
 * - Seed objects via __TEST_STORE__.setObject (deterministic ids)
 * - Select with __ctTest.click, lock/unlock with real key presses
 * - Drive the pointer with __ctTest.drag in world coordinates
 * - Read positions and _locked back from the store
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface Point {
  x: number;
  y: number;
}

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _locked: boolean;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, StoreObject>;
}

interface PageTestBoard {
  waitForRenderer: () => Promise<void>;
  waitForSelectionSettled: () => Promise<void>;
}

interface PageCtTest {
  click: (pt: Point) => void;
  drag: (from: Point, to: Point, opts?: { steps?: number }) => Promise<void>;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __TEST_BOARD__?: PageTestBoard;
  __ctTest?: PageCtTest;
}

interface Seed {
  id: string;
  obj: Record<string, unknown>;
}

interface Snapshot {
  pos: Point;
  locked: boolean;
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

function base(
  kind: string,
  pos: Point,
  sortKey: string,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    _kind: kind,
    _pos: { x: pos.x, y: pos.y, r: 0 },
    _sortKey: sortKey,
    _locked: false,
    _selectedBy: null,
    _containerId: null,
    _meta: {},
    ...extra,
  };
}

function zoneSeed(
  id: string,
  pos: Point,
  sortKey: string,
  meta: Record<string, unknown>,
): Seed {
  return { id, obj: base('zone', pos, sortKey, { _meta: meta }) };
}

function stackSeed(id: string, pos: Point, sortKey: string): Seed {
  return {
    id,
    obj: base('stack', pos, sortKey, {
      _cards: [{ code: `card-${id}` }],
      _faceUp: true,
    }),
  };
}

async function snapshot(page: Page): Promise<Map<string, Snapshot>> {
  const rows = await page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries()).map(([id, o]) => ({
      id,
      pos: { x: o._pos.x, y: o._pos.y },
      locked: o._locked,
    }));
  });
  return new Map(rows.map(({ id, ...rest }) => [id, rest]));
}

async function seed(page: Page, seeds: Seed[]): Promise<void> {
  await page.evaluate((list) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    for (const s of list) store.setObject(s.id, s.obj);
  }, seeds);
  await expect.poll(async () => (await snapshot(page)).size).toBe(seeds.length);
}

async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.evaluate(
    async ([f, t]) => {
      const g = globalThis as unknown as PageGlobals;
      await g.__ctTest!.drag(f, t, { steps: 10 });
      await g.__TEST_BOARD__!.waitForRenderer();
    },
    [from, to] as const,
  );
}

async function clickAt(page: Page, pt: Point): Promise<void> {
  await page.evaluate(async (p) => {
    const g = globalThis as unknown as PageGlobals;
    g.__ctTest!.click(p);
    await g.__TEST_BOARD__!.waitForSelectionSettled();
  }, pt);
}

async function expectLocked(
  page: Page,
  id: string,
  locked: boolean,
): Promise<void> {
  await expect
    .poll(async () => (await snapshot(page)).get(id)!.locked, {
      message: `${id} _locked`,
    })
    .toBe(locked);
}

function expectMovedBy(
  before: Map<string, Snapshot>,
  after: Map<string, Snapshot>,
  ids: string[],
  delta: Point,
): void {
  for (const id of ids) {
    expect(after.get(id)!.pos, `${id} moved`).toEqual({
      x: before.get(id)!.pos.x + delta.x,
      y: before.get(id)!.pos.y + delta.y,
    });
  }
}

function expectUnmoved(
  before: Map<string, Snapshot>,
  after: Map<string, Snapshot>,
  ids: string[],
): void {
  for (const id of ids) {
    expect(after.get(id)!.pos, `${id} stayed`).toEqual(before.get(id)!.pos);
  }
}

const ZONE_LABEL: Point = { x: 0, y: -116 };
const K: Point = { x: -80, y: 0 };

const SCENE: Seed[] = [
  zoneSeed('z', { x: 0, y: 0 }, '000001', {
    label: 'Play Area',
    width: 300,
    height: 200,
  }),
  stackSeed('k', K, '000002'),
  stackSeed('u', { x: 80, y: 0 }, '000003'),
];

test.describe('Object lock blocks dragging (ct-623.7)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const tableId = `object-lock-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await waitForReady(page);
    await seed(page, SCENE);
  });

  test('a locked card does not move on a direct drag', async ({ page }) => {
    await clickAt(page, K);
    await page.keyboard.press('l');
    await expectLocked(page, 'k', true);
    const before = await snapshot(page);

    await drag(page, K, { x: -80, y: 300 });

    expectUnmoved(before, await snapshot(page), ['k', 'u', 'z']);
  });

  test('a locked card stays put when its zone is dragged by the label', async ({
    page,
  }) => {
    await clickAt(page, K);
    await page.keyboard.press('l');
    await expectLocked(page, 'k', true);
    const before = await snapshot(page);

    await drag(page, ZONE_LABEL, { x: 0, y: -416 });

    const after = await snapshot(page);
    expectMovedBy(before, after, ['z', 'u'], { x: 0, y: -300 });
    expectUnmoved(before, after, ['k']);
  });

  test('a locked zone does not move, but a card inside it can be dragged out', async ({
    page,
  }) => {
    await clickAt(page, K);
    await page.keyboard.press('l');
    await expectLocked(page, 'k', true);
    await clickAt(page, K);
    await page.keyboard.press('Shift+L');
    await expectLocked(page, 'k', false);

    await clickAt(page, ZONE_LABEL);
    await page.keyboard.press('l');
    await expectLocked(page, 'z', true);
    const before = await snapshot(page);

    // A blocked drag falls through to the pointer's gesture: in the default
    // pan mode that pans the camera and shifts every later world coordinate
    // (__ctTest assumes camera at origin), so use select mode, where it
    // rectangle-selects instead.
    await page.click('[data-testid="interaction-mode-toggle"]');
    await expect(
      page.locator('[data-testid="interaction-mode-toggle"]'),
    ).toContainText('Select Mode');

    await drag(page, ZONE_LABEL, { x: 0, y: -416 });
    expectUnmoved(before, await snapshot(page), ['z', 'k', 'u']);

    await drag(page, { x: 80, y: 0 }, { x: 80, y: 400 });
    const after = await snapshot(page);
    expect(after.get('u')!.pos).toEqual({ x: 80, y: 400 });
    expectUnmoved(before, after, ['z', 'k']);
  });

  test('unlocking a zone restores dragging it with its contents', async ({
    page,
  }) => {
    await clickAt(page, ZONE_LABEL);
    await page.keyboard.press('l');
    await expectLocked(page, 'z', true);
    await clickAt(page, ZONE_LABEL);
    await page.keyboard.press('Shift+L');
    await expectLocked(page, 'z', false);
    const before = await snapshot(page);

    await drag(page, ZONE_LABEL, { x: 0, y: -416 });

    expectMovedBy(before, await snapshot(page), ['z', 'k', 'u'], {
      x: 0,
      y: -300,
    });
  });
});
