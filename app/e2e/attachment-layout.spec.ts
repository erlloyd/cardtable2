/**
 * E2E for the dev-only attachment direction override (ct-t1c).
 *
 * Locks in the full pipeline
 *   plugin manifest -> BoardMessageBus -> attachCards ->
 *   computeAttachmentPositions -> _pos
 * for a non-default direction (`'top-right'`).  Epic ct-2ie shipped
 * 8-direction support with thorough unit tests of the math, but no
 * shipped plugin currently sets a non-default `attachmentLayout.direction`,
 * so without this spec the runtime wiring goes uncovered.
 *
 * Test strategy
 * -------------
 * 1.  Navigate to a fresh `/dev/table/:id` and seed two single-card
 *     stacks via `__TEST_STORE__.setObject` (deterministic IDs and
 *     positions, no plugin needed).
 * 2.  Set the override to `'top-right'` via `__ctTest.setAttachmentDirection`.
 * 3.  Drive a real Alt-drag from the would-be-child stack onto the
 *     would-be-parent stack.  Alt held forces the renderer's pointer
 *     handler to emit `attach-cards` (not `stack-objects`) — see
 *     `app/src/renderer/handlers/pointer.ts` (~line 1305 and ~1124).
 * 4.  After the renderer settles, read the child's `_pos` and assert
 *     it sits to the upper-right of the parent (`dx > 0 && dy < 0`),
 *     proving the override was actually applied to the math.
 * 5.  Clear the override and repeat — assert the default `'bottom'`
 *     direction is restored (`dy > 0`).
 */

import { test, expect } from './_fixtures';
import type { AttachmentDirection } from '@cardtable2/shared';

// Local types for use inside `page.evaluate` callbacks.  Mirrors the
// store/window surface but kept narrow to this spec so the page-side
// type assertions stay loose.
interface Pos {
  x: number;
  y: number;
  r: number;
}

interface SeededStack {
  id: string;
  pos: Pos;
}

interface SeededPair {
  parent: SeededStack;
  child: SeededStack;
}

// Window types used inside page.evaluate.  The real types live in
// `app/src/vite-env.d.ts`; redeclaring the slice we use keeps the
// page-side code self-contained.
interface YMapLike {
  get: (key: string) => unknown;
}

interface PageTestStore {
  setObject: (id: string, obj: Record<string, unknown>) => void;
  getObjectYMap: (id: string) => YMapLike | undefined;
  getAllObjects: () => Map<string, { _kind: string; _pos: Pos }>;
}

interface PageCtTest {
  setAttachmentDirection: (dir: AttachmentDirection | null) => void;
}

interface PageTestBoard {
  waitForRenderer: () => Promise<void>;
  waitForSelectionSettled: () => Promise<void>;
}

interface PageGlobals {
  __TEST_STORE__?: PageTestStore;
  __ctTest?: PageCtTest;
  __TEST_BOARD__?: PageTestBoard;
}

/**
 * Seed a parent stack on the left and a child-candidate stack on the
 * right.  Uses fixed IDs so we don't have to enumerate the store after
 * seeding.  Returns viewport coords for both stacks so callers can
 * drive a real `page.mouse` drag.
 */
async function seedTwoStacks(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
): Promise<SeededPair & { parentViewport: Pos; childViewport: Pos }> {
  return await page.evaluate(() => {
    const globals = globalThis as unknown as PageGlobals;
    const store = globals.__TEST_STORE__;
    if (!store) {
      throw new Error('__TEST_STORE__ not exposed — must run on /dev/table');
    }

    const parentPos = { x: -100, y: 0, r: 0 };
    const childPos = { x: 100, y: 0, r: 0 };
    const parentId = 'e2e-attach-parent';
    const childId = 'e2e-attach-child';

    // Minimal stack shapes.  `_kind: 'stack'` matches `ObjectKind.Stack`
    // (the enum value is the string `'stack'`); other fields mirror the
    // defaults `createObject` would produce for a single-card stack.
    store.setObject(parentId, {
      _kind: 'stack',
      _containerId: null,
      _pos: parentPos,
      _sortKey: '0001',
      _locked: false,
      _selectedBy: null,
      _meta: {},
      _cards: ['e2e-parent-card'],
      _faceUp: true,
    });
    store.setObject(childId, {
      _kind: 'stack',
      _containerId: null,
      _pos: childPos,
      _sortKey: '0002',
      _locked: false,
      _selectedBy: null,
      _meta: {},
      _cards: ['e2e-child-card'],
      _faceUp: true,
    });

    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas element');
    const rect = canvas.getBoundingClientRect();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;

    return {
      parent: { id: parentId, pos: parentPos },
      child: { id: childId, pos: childPos },
      parentViewport: {
        x: rect.left + cx + parentPos.x,
        y: rect.top + cy + parentPos.y,
        r: 0,
      },
      childViewport: {
        x: rect.left + cx + childPos.x,
        y: rect.top + cy + childPos.y,
        r: 0,
      },
    };
  });
}

test.describe('Attachment direction override (ct-t1c)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const tableId = `attach-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/dev/table/${tableId}`);

    await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('worker-status')).toContainText(
      'Initialized',
      { timeout: 5000 },
    );
    await expect(page.getByTestId('board-canvas')).toBeVisible({
      timeout: 5000,
    });
    await page.waitForFunction(() => {
      const globals = globalThis as unknown as PageGlobals;
      return Boolean(globals.__TEST_BOARD__);
    });
    await page.waitForFunction(() => {
      const globals = globalThis as unknown as PageGlobals;
      return Boolean(globals.__ctTest);
    });

    // Make sure no override leaked from a prior run on the same dev
    // server.  The override is module-level state in the page, not part
    // of `__TEST_STORE__`, so the auto-clear fixture does not touch it.
    await page.evaluate(() => {
      const globals = globalThis as unknown as PageGlobals;
      globals.__ctTest?.setAttachmentDirection(null);
    });
  });

  test.afterEach(async ({ page }) => {
    // Always release the override so a flaky teardown doesn't leak into
    // the next test.
    await page.evaluate(() => {
      const globals = globalThis as unknown as PageGlobals;
      globals.__ctTest?.setAttachmentDirection(null);
    });
  });

  test('top-right override places child to the upper-right of parent', async ({
    page,
  }) => {
    const seeded = await seedTwoStacks(page);

    // Wait for renderer to receive the seeded objects so the drag can
    // hit them.
    await page.evaluate(async () => {
      const globals = globalThis as unknown as PageGlobals;
      await globals.__TEST_BOARD__?.waitForRenderer();
    });

    // Apply the dev override BEFORE the attach fires.  The
    // BoardMessageBus reads it inside the `attach-cards` handler.
    await page.evaluate(() => {
      const globals = globalThis as unknown as PageGlobals;
      globals.__ctTest?.setAttachmentDirection('top-right');
    });

    // Click the child stack to select it (matches the pattern used by
    // `stack-operations.spec.ts`).
    await page.mouse.click(seeded.childViewport.x, seeded.childViewport.y);
    await page.evaluate(async () => {
      const globals = globalThis as unknown as PageGlobals;
      await globals.__TEST_BOARD__?.waitForSelectionSettled();
    });

    // Alt-drag the child onto the parent.  Alt forces the renderer's
    // pointer handler to emit `attach-cards` (not `stack-objects`) —
    // see `app/src/renderer/handlers/pointer.ts:1305`.
    await page.keyboard.down('Alt');
    await page.mouse.move(seeded.childViewport.x, seeded.childViewport.y);
    await page.mouse.down();
    await page.mouse.move(seeded.parentViewport.x, seeded.parentViewport.y, {
      steps: 10,
    });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    // Let the renderer process the attach-cards round-trip.
    await page.evaluate(async () => {
      const globals = globalThis as unknown as PageGlobals;
      await globals.__TEST_BOARD__?.waitForRenderer();
    });

    // Read both positions back from the store.  After attach the child
    // is repositioned by `computeAttachmentPositions(parentPos, 1,
    // {direction: 'top-right', revealFraction: 0.25})` — for a single
    // attachment that's `(parent.x + STACK_WIDTH*0.25, parent.y -
    // STACK_HEIGHT*0.25)`.  We assert the *signs* of the deltas rather
    // than exact magnitudes so the test isn't coupled to STACK_WIDTH /
    // STACK_HEIGHT or the default revealFraction.
    const positions = await page.evaluate(
      ({ parentId, childId }: { parentId: string; childId: string }) => {
        const globals = globalThis as unknown as PageGlobals;
        const store = globals.__TEST_STORE__;
        if (!store) throw new Error('__TEST_STORE__ went away');
        const parent = store.getObjectYMap(parentId);
        const child = store.getObjectYMap(childId);
        return {
          parentPos: parent?.get('_pos') as Pos | undefined,
          childPos: child?.get('_pos') as Pos | undefined,
          childAttachedTo: child?.get('_attachedToId') as string | undefined,
          parentAttachments: parent?.get('_attachedCardIds') as
            | string[]
            | undefined,
        };
      },
      { parentId: seeded.parent.id, childId: seeded.child.id },
    );

    // Sanity: the attach happened at all.
    expect(positions.childAttachedTo).toBe(seeded.parent.id);
    expect(positions.parentAttachments).toEqual([seeded.child.id]);

    // The substantive override-applied assertion:
    // top-right => child shifted +x, -y relative to parent.
    expect(positions.parentPos).toBeTruthy();
    expect(positions.childPos).toBeTruthy();
    if (!positions.parentPos || !positions.childPos) return;
    expect(positions.childPos.x).toBeGreaterThan(positions.parentPos.x);
    expect(positions.childPos.y).toBeLessThan(positions.parentPos.y);
  });

  test('cleared override falls back to default bottom direction', async ({
    page,
  }) => {
    const seeded = await seedTwoStacks(page);

    await page.evaluate(async () => {
      const globals = globalThis as unknown as PageGlobals;
      await globals.__TEST_BOARD__?.waitForRenderer();
    });

    // Set then immediately clear the override.  The BoardMessageBus
    // should ignore it once cleared and fall back to the default
    // direction (which is `'bottom'` per `DEFAULT_ATTACHMENT_LAYOUT`).
    await page.evaluate(() => {
      const globals = globalThis as unknown as PageGlobals;
      globals.__ctTest?.setAttachmentDirection('top-right');
      globals.__ctTest?.setAttachmentDirection(null);
    });

    await page.mouse.click(seeded.childViewport.x, seeded.childViewport.y);
    await page.evaluate(async () => {
      const globals = globalThis as unknown as PageGlobals;
      await globals.__TEST_BOARD__?.waitForSelectionSettled();
    });

    await page.keyboard.down('Alt');
    await page.mouse.move(seeded.childViewport.x, seeded.childViewport.y);
    await page.mouse.down();
    await page.mouse.move(seeded.parentViewport.x, seeded.parentViewport.y, {
      steps: 10,
    });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    await page.evaluate(async () => {
      const globals = globalThis as unknown as PageGlobals;
      await globals.__TEST_BOARD__?.waitForRenderer();
    });

    const positions = await page.evaluate(
      ({ parentId, childId }: { parentId: string; childId: string }) => {
        const globals = globalThis as unknown as PageGlobals;
        const store = globals.__TEST_STORE__;
        if (!store) throw new Error('__TEST_STORE__ went away');
        const parent = store.getObjectYMap(parentId);
        const child = store.getObjectYMap(childId);
        return {
          parentPos: parent?.get('_pos') as Pos | undefined,
          childPos: child?.get('_pos') as Pos | undefined,
          childAttachedTo: child?.get('_attachedToId') as string | undefined,
        };
      },
      { parentId: seeded.parent.id, childId: seeded.child.id },
    );

    expect(positions.childAttachedTo).toBe(seeded.parent.id);
    expect(positions.parentPos).toBeTruthy();
    expect(positions.childPos).toBeTruthy();
    if (!positions.parentPos || !positions.childPos) return;
    // Default direction is 'bottom' => child shifted +y (downward) and
    // x roughly unchanged.  Assert the y-axis sign change so this test
    // would catch a regression where the override leaks across calls.
    expect(positions.childPos.y).toBeGreaterThan(positions.parentPos.y);
  });
});
