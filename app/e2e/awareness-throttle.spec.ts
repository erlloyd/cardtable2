/**
 * E2E test for ct-ajw.34: YjsStore is the single owner of the cursor and drag
 * awareness throttles, and clearing cancels the pending trailing update.
 *
 * Scenario this protects against: a throttled trailing awareness call firing
 * AFTER the clear (drag release / pointer leave) and resurrecting the state on
 * remote clients, where it would stay forever (ghost drag / stuck cursor).
 *
 * Two browser contexts share one WebSocket-backed Y.Doc. Client B records
 * every awareness change it sees from client A; client A drags a card with a
 * burst of synchronous pointer moves (so a trailing drag update is pending at
 * release), releases, then leaves the canvas.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

interface RemoteState {
  drag?: unknown;
  cursor?: unknown;
}

interface PageTestStore {
  setObject: (id: string, obj: unknown) => void;
  getAllObjects: () => Map<string, unknown>;
  waitForReady: () => Promise<void>;
  getRemoteAwarenessStates: () => Map<number, RemoteState>;
  onAwarenessChange: (cb: () => void) => () => void;
}

interface PageTestBoard {
  waitForRenderer: () => Promise<void>;
}

interface PageCtTest {
  drag: (
    from: { x: number; y: number },
    to: { x: number; y: number },
    opts?: { steps?: number },
  ) => Promise<void>;
  pointerMove: (pt: { x: number; y: number }) => void;
  click: (pt: { x: number; y: number }) => void;
}

interface AwarenessLogEntry {
  drag: boolean;
  cursor: boolean;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __TEST_BOARD__?: PageTestBoard;
  __ctTest?: PageCtTest;
  __awarenessLog?: AwarenessLogEntry[];
}

async function waitForTable(page: Page) {
  await page.waitForFunction(
    () => {
      const g = globalThis as unknown as PageGlobals;
      return (
        Boolean(g.__TEST_STORE__) &&
        Boolean(g.__TEST_BOARD__) &&
        Boolean(g.__ctTest)
      );
    },
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(async () => {
    const g = globalThis as unknown as PageGlobals;
    await g.__TEST_STORE__!.waitForReady();
    await g.__TEST_BOARD__!.waitForRenderer();
  });
}

/** Record, on this page, whether the remote client has drag/cursor set. */
async function startRecording(page: Page) {
  await page.evaluate(() => {
    const g = globalThis as unknown as PageGlobals;
    const store = g.__TEST_STORE__!;
    const log: AwarenessLogEntry[] = [];
    g.__awarenessLog = log;
    store.onAwarenessChange(() => {
      const [remote] = [...store.getRemoteAwarenessStates().values()];
      log.push({
        drag: Boolean(remote?.drag),
        cursor: Boolean(remote?.cursor),
      });
    });
  });
}

async function readLog(page: Page, field: 'drag' | 'cursor') {
  return page.evaluate(
    (f) =>
      (globalThis as unknown as PageGlobals).__awarenessLog!.map((e) => e[f]),
    field,
  );
}

test.describe('Awareness throttle ownership (ct-ajw.34)', () => {
  test('release and pointer-leave clear remote awareness with no trailing resurrect', async ({
    browser,
  }, testInfo) => {
    const tableId = `awareness-throttle-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}`;

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Navigate both BEFORE seeding: the fixture clears the store on each goto.
    await pageA.goto(`/dev/table/${tableId}`);
    await pageB.goto(`/dev/table/${tableId}`);
    await waitForTable(pageA);
    await waitForTable(pageB);

    await pageA.evaluate(() => {
      (globalThis as unknown as PageGlobals).__TEST_STORE__!.setObject(
        'e2e-drag-card',
        {
          _kind: 'stack',
          _pos: { x: 0, y: 0, r: 0 },
          _sortKey: '000001',
          _locked: false,
          _selectedBy: null,
          _containerId: null,
          _meta: {},
          _cards: [{ code: 'e2e-card-a' }],
          _faceUp: true,
        },
      );
    });
    await pageB.waitForFunction(
      () =>
        (globalThis as unknown as PageGlobals).__TEST_STORE__!.getAllObjects()
          .size === 1,
      undefined,
      { timeout: 10_000 },
    );
    await pageA.evaluate(() =>
      (globalThis as unknown as PageGlobals).__TEST_BOARD__!.waitForRenderer(),
    );

    // ---------------- Drag and release ----------------
    await startRecording(pageB);

    // The seeded stack reaches the renderer worker asynchronously and the
    // store has no signal for that; a click + settle makes the hit-test see it.
    await pageA.evaluate(() => {
      (globalThis as unknown as PageGlobals).__ctTest!.click({ x: 0, y: 0 });
    });
    await pageA.waitForTimeout(500);

    await pageA.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      await g.__ctTest!.drag({ x: 0, y: 0 }, { x: 200, y: 100 }, { steps: 10 });
      await g.__TEST_BOARD__!.waitForRenderer();
    });

    // B must have seen the drag and then the clear.
    await expect
      .poll(async () => {
        const seq = await readLog(pageB, 'drag');
        return seq.includes(true) && seq.at(-1) === false;
      })
      .toBe(true);

    // Anything after the clear is a resurrected trailing update.
    await pageB.waitForTimeout(150);
    const dragSeq = await readLog(pageB, 'drag');
    const firstClear = dragSeq.indexOf(false, dragSeq.indexOf(true));
    expect(dragSeq.slice(firstClear).every((set) => !set)).toBe(true);
    expect(dragSeq.at(-1)).toBe(false);

    // ---------------- Pointer leaves the canvas ----------------
    await pageB.evaluate(() => {
      (globalThis as unknown as PageGlobals).__awarenessLog!.length = 0;
    });

    await pageA.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      g.__ctTest!.pointerMove({ x: 10, y: 10 });
      g.__ctTest!.pointerMove({ x: 20, y: 20 });
      g.__ctTest!.pointerMove({ x: 30, y: 30 });
      await g.__TEST_BOARD__!.waitForRenderer();
    });
    // Let the cursor reach B (cursor-position round-trips through the worker)
    // before leaving, so the leave is not racing an in-flight cursor message.
    await expect
      .poll(async () => (await readLog(pageB, 'cursor')).at(-1))
      .toBe(true);
    await pageB.waitForTimeout(100);

    await pageA.evaluate(async () => {
      const g = globalThis as unknown as PageGlobals;
      // React derives onPointerLeave from pointerout with no relatedTarget.
      const canvas = document.querySelector('canvas')!;
      canvas.dispatchEvent(
        new PointerEvent('pointerout', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
        }),
      );
      await g.__TEST_BOARD__!.waitForRenderer();
    });

    await expect
      .poll(async () => {
        const seq = await readLog(pageB, 'cursor');
        return seq.includes(true) && seq.at(-1) === false;
      })
      .toBe(true);

    await pageB.waitForTimeout(150);
    const cursorSeq = await readLog(pageB, 'cursor');
    const firstCursorClear = cursorSeq.indexOf(false, cursorSeq.indexOf(true));
    expect(cursorSeq.slice(firstCursorClear).every((set) => !set)).toBe(true);
    expect(cursorSeq.at(-1)).toBe(false);

    await ctxA.close();
    await ctxB.close();
  });
});
