/**
 * Loop-closing E2E for discarding a card together with its attached cards
 * (ct-m0a.2).
 *
 * "Attached card" means the `_attachedToId` / `_attachedCardIds` link between
 * two stacks, not `_meta.attachments` (tokens/status/modifiers).
 *
 * The path under test is keyboard X -> ActionRegistry discard-card ->
 * discardCardToZone -> store. Objects are seeded through __TEST_STORE__; the
 * selection and the discard are driven through the UI. Route: /table/:id, which
 * does not expose __TEST_BOARD__, so selection is awaited by polling
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
  _containerId?: string | null;
  _selectedBy?: string | null;
  _attachedToId?: string;
  _attachedCardIds?: string[];
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, StoreObject>;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: {
    click: (pt: Point) => void;
  };
}

interface Snapshot {
  id: string;
  kind: string;
  cards: CardEntry[];
  containerId: string | null | undefined;
  selectedBy: string | null | undefined;
  attachedToId: string | undefined;
  attachedCardIds: string[] | undefined;
}

async function openTable(page: Page, testId: string): Promise<void> {
  const tableId = `dat-${testId.replace(/[^a-z0-9]/gi, '-')}`;
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
}

async function seedZone(
  page: Page,
  id: string,
  pos: Point,
  label: string,
): Promise<void> {
  await page.evaluate(
    ({ id, pos, label }) => {
      const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
      store.setObject(id, {
        _kind: 'zone',
        _pos: { x: pos.x, y: pos.y, r: 0 },
        _sortKey: id,
        _locked: false,
        _selectedBy: null,
        _containerId: null,
        _meta: { label, isDiscardZone: true, width: 71, height: 96 },
      });
    },
    { id, pos, label },
  );
}

interface StackSeed {
  id: string;
  pos: Point;
  cards: CardEntry[];
  sortKey: string;
  containerId?: string;
  faceUp?: boolean;
  attachedToId?: string;
  attachedCardIds?: string[];
}

async function seedStack(page: Page, seed: StackSeed): Promise<void> {
  await page.evaluate((s) => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    store.setObject(s.id, {
      _kind: 'stack',
      _pos: { x: s.pos.x, y: s.pos.y, r: 0 },
      _sortKey: s.sortKey,
      _locked: false,
      _selectedBy: null,
      _containerId: s.containerId ?? null,
      _meta: {},
      _cards: s.cards,
      _faceUp: s.faceUp ?? false,
      ...(s.attachedToId ? { _attachedToId: s.attachedToId } : {}),
      ...(s.attachedCardIds ? { _attachedCardIds: s.attachedCardIds } : {}),
    });
  }, seed);
}

function snapshot(page: Page): Promise<Snapshot[]> {
  return page.evaluate(() => {
    const store = (globalThis as unknown as PageGlobals).__TEST_STORE__!;
    return Array.from(store.getAllObjects().entries()).map(([id, obj]) => ({
      id,
      kind: obj._kind,
      cards: obj._cards ?? [],
      containerId: obj._containerId,
      selectedBy: obj._selectedBy,
      attachedToId: obj._attachedToId,
      attachedCardIds: obj._attachedCardIds,
    }));
  });
}

async function findObject(
  page: Page,
  id: string,
): Promise<Snapshot | undefined> {
  return (await snapshot(page)).find((o) => o.id === id);
}

async function getObject(page: Page, id: string): Promise<Snapshot> {
  const found = await findObject(page, id);
  if (!found) throw new Error(`object ${id} not found`);
  return found;
}

/** Canvas-click `pt` and wait until `id` is the selected object. */
async function selectAt(page: Page, pt: Point, id: string): Promise<void> {
  await page.evaluate((p) => {
    (globalThis as unknown as PageGlobals).__ctTest!.click(p);
  }, pt);
  await expect
    .poll(async () => (await findObject(page, id))?.selectedBy ?? null)
    .not.toBeNull();
}

test.describe('Discard cascades to attached cards (ct-m0a.2)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openTable(page, testInfo.testId);
  });

  test('host with an attached card from a different zone: X on the host sends each to its own pile', async ({
    page,
  }) => {
    await seedZone(page, 'zone-enc', { x: -300, y: 200 }, 'Encounter Discard');
    await seedZone(page, 'zone-ply', { x: 300, y: 200 }, 'Player Discard');
    await seedStack(page, {
      id: 'pile-enc',
      pos: { x: -300, y: 200 },
      cards: [{ code: 'enc-old', homeZone: 'zone-enc' }],
      sortKey: '000001|000001',
      containerId: 'zone-enc',
      faceUp: true,
    });
    await seedStack(page, {
      id: 'pile-ply',
      pos: { x: 300, y: 200 },
      cards: [{ code: 'ply-old', homeZone: 'zone-ply' }],
      sortKey: '000002|000001',
      containerId: 'zone-ply',
      faceUp: true,
    });
    await seedStack(page, {
      id: 'host',
      pos: { x: 0, y: -100 },
      cards: [{ code: 'sandman', homeZone: 'zone-enc' }],
      sortKey: '000005|999999',
      attachedCardIds: ['att'],
    });
    await seedStack(page, {
      id: 'att',
      pos: { x: 0, y: -78 },
      cards: [{ code: 'tracer', homeZone: 'zone-ply' }],
      sortKey: '000005|000001',
      attachedToId: 'host',
    });
    await expect.poll(async () => (await snapshot(page)).length).toBe(6);

    // Precondition: the two stacks really are linked.
    expect((await getObject(page, 'host')).attachedCardIds).toEqual(['att']);
    expect((await getObject(page, 'att')).attachedToId).toBe('host');

    let dialogSeen = false;
    page.on('dialog', (dialog) => {
      dialogSeen = true;
      void dialog.dismiss();
    });

    // Upper half of the host: the attached card starts 22 units lower.
    await selectAt(page, { x: 0, y: -130 }, 'host');
    await page.keyboard.press('x');

    await expect
      .poll(async () => {
        const all = await snapshot(page);
        return all.some((o) => o.id === 'host' || o.id === 'att');
      })
      .toBe(false);

    expect((await getObject(page, 'pile-enc')).cards).toEqual([
      { code: 'sandman', homeZone: 'zone-enc' },
      { code: 'enc-old', homeZone: 'zone-enc' },
    ]);
    expect((await getObject(page, 'pile-ply')).cards).toEqual([
      { code: 'tracer', homeZone: 'zone-ply' },
      { code: 'ply-old', homeZone: 'zone-ply' },
    ]);

    const linked = (await snapshot(page)).filter(
      (o) =>
        o.attachedToId !== undefined ||
        (o.attachedCardIds !== undefined && o.attachedCardIds.length > 0),
    );
    expect(linked).toEqual([]);

    await expect(
      page.getByRole('status').filter({ hasText: 'no discard zone' }),
    ).toHaveCount(0);
    expect(dialogSeen).toBe(false);
  });
});
