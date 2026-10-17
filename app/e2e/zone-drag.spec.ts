/**
 * E2E tests for dragging a zone (ct-623): a real pointer drag of a zone, by its
 * label or by its body, carries the objects whose centers are inside it,
 * including nested zones, and keeps the discard pile linked to its zone.
 *
 * Strategy:
 * - Seed objects via __TEST_STORE__.setObject (deterministic ids)
 * - Drive the pointer with __ctTest.drag in world coordinates
 * - Read positions and _containerId back from the store
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface Point {
  x: number;
  y: number;
}

interface CardEntry {
  code: string;
  homeZone?: string;
}

interface StoreObject {
  _kind: string;
  _pos: { x: number; y: number; r: number };
  _cards?: CardEntry[];
  _containerId?: string | null;
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
  containerId: string | null | undefined;
  cards: CardEntry[];
  kind: string;
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

function stackSeed(
  id: string,
  pos: Point,
  sortKey: string,
  extra: Record<string, unknown> = {},
): Seed {
  return {
    id,
    obj: base('stack', pos, sortKey, {
      _cards: [{ code: `card-${id}` }],
      _faceUp: true,
      ...extra,
    }),
  };
}

async function seed(page: Page, seeds: Seed[]): Promise<void> {
  await page.evaluate((list) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    for (const s of list) store.setObject(s.id, s.obj);
  }, seeds);
  await expect.poll(async () => (await snapshot(page)).size).toBe(seeds.length);
}

async function snapshot(page: Page): Promise<Map<string, Snapshot>> {
  const rows = await page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries()).map(([id, o]) => ({
      id,
      kind: o._kind,
      pos: { x: o._pos.x, y: o._pos.y },
      containerId: o._containerId,
      cards: o._cards ?? [],
    }));
  });
  return new Map(rows.map(({ id, ...rest }) => [id, rest]));
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

const DISCARD_SCENE: Seed[] = [
  zoneSeed('z', { x: 75, y: 0 }, '000001', {
    isDiscardZone: true,
    label: 'Discard',
    width: 71,
    height: 96,
  }),
  stackSeed('p', { x: 75, y: 0 }, '000002', {
    _cards: [{ code: 'p-1' }, { code: 'p-2' }],
    _containerId: 'z',
    _attachedCardIds: ['a'],
  }),
  stackSeed('a', { x: 75, y: 22 }, '000002|000001', { _attachedToId: 'p' }),
  // Small token: the default 40px radius would cover the body grab point (41,0)
  {
    id: 't',
    obj: base('token', { x: 80, y: 10 }, '000003', { _meta: { size: 10 } }),
  },
  stackSeed('o', { x: 115, y: 0 }, '000004'),
  stackSeed('h', { x: -200, y: 0 }, '000005', {
    _cards: [{ code: 'h-1', homeZone: 'z' }],
    _faceUp: false,
  }),
];

test.describe('Zone drag carries contents (ct-623)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const tableId = `zone-drag-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);
    await waitForReady(page);
  });

  test('dragging a discard zone by its label carries the pile, and the next discard joins it', async ({
    page,
  }) => {
    await seed(page, DISCARD_SCENE);
    const before = await snapshot(page);

    await drag(page, { x: 75, y: -66 }, { x: 75, y: -266 });

    const after = await snapshot(page);
    expectMovedBy(before, after, ['z', 'p', 't', 'a'], { x: 0, y: -200 });
    expectUnmoved(before, after, ['o', 'h']);
    expect(after.get('p')!.containerId).toBe('z');

    // Discard h: it must merge into p, not start a second pile
    await page.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.click({ x: -200, y: 0 });
      await g.__TEST_BOARD__!.waitForSelectionSettled();
    });
    await page.keyboard.press('x');
    await page.evaluate(async () => {
      await (
        globalThis as unknown as PageGlobals
      ).__TEST_BOARD__!.waitForRenderer();
    });

    await expect
      .poll(async () => {
        const piles = [...(await snapshot(page)).values()].filter(
          (o) => o.kind === 'stack' && o.containerId === 'z',
        );
        return piles.map((o) => ({ pos: o.pos, cards: o.cards.length }));
      })
      .toEqual([{ pos: { x: 75, y: -200 }, cards: 3 }]);
  });

  test('dragging a discard zone by its body carries the pile', async ({
    page,
  }) => {
    await seed(page, DISCARD_SCENE);
    const before = await snapshot(page);

    await drag(page, { x: 41, y: 0 }, { x: -109, y: 0 });

    const after = await snapshot(page);
    expectMovedBy(before, after, ['z', 'p', 't', 'a'], { x: -150, y: 0 });
    expectUnmoved(before, after, ['o', 'h']);
    expect(after.get('p')!.containerId).toBe('z');
  });

  test('dragging a play-area zone by its label carries a nested discard zone and its pile', async ({
    page,
  }) => {
    await seed(page, [
      zoneSeed('P', { x: 0, y: 300 }, '000001', {
        label: 'Play Area',
        width: 300,
        height: 200,
      }),
      stackSeed('d', { x: -80, y: 300 }, '000002'),
      zoneSeed('dz', { x: 80, y: 300 }, '000003', {
        isDiscardZone: true,
        width: 71,
        height: 96,
      }),
      stackSeed('dp', { x: 80, y: 300 }, '000004', { _containerId: 'dz' }),
      stackSeed('e', { x: 160, y: 300 }, '000005'),
    ]);
    const before = await snapshot(page);

    await drag(page, { x: 0, y: 184 }, { x: 0, y: 434 });

    const after = await snapshot(page);
    expectMovedBy(before, after, ['P', 'd', 'dz', 'dp'], { x: 0, y: 250 });
    expectUnmoved(before, after, ['e']);
    expect(after.get('dp')!.containerId).toBe('dz');
  });
});
