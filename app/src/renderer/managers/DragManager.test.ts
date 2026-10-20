import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DragManager } from './DragManager';
import { GestureRecognizer } from './GestureRecognizer';
import { ObjectKind } from '@cardtable2/shared';
import type { PointerEventData } from '@cardtable2/shared';
import type { SceneManager } from '../SceneManager';
import type { SelectionManager } from './SelectionManager';

function makePointerEvent(
  overrides: Partial<PointerEventData> = {},
): PointerEventData {
  return {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 0,
    clientY: 0,
    isPrimary: true,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

function makeSceneManager(
  objects: Record<
    string,
    {
      x: number;
      y: number;
      r?: number;
      kind?: ObjectKind;
      sortKey?: string;
      selectedBy?: string;
      attachedToId?: string;
      attachedCardIds?: string[];
      meta?: Record<string, unknown>;
    }
  > = {},
): SceneManager {
  const store = new Map(
    Object.entries(objects).map(([id, o]) => [
      id,
      {
        _id: id,
        _kind: o.kind ?? ObjectKind.Stack,
        _pos: { x: o.x, y: o.y, r: o.r ?? 0 },
        _containerId: 'c1',
        _sortKey: o.sortKey ?? '0',
        _locked: false,
        _selectedBy: o.selectedBy ?? null,
        _meta: o.meta ?? {},
        ...(o.attachedToId ? { _attachedToId: o.attachedToId } : {}),
        ...(o.attachedCardIds ? { _attachedCardIds: o.attachedCardIds } : {}),
      },
    ]),
  );

  return {
    getObject: vi.fn((id: string) => store.get(id)),
    getAllObjects: vi.fn(() => store),
    updateObject: vi.fn(),
    removeSpatialEntries: vi.fn(),
  } as unknown as SceneManager;
}

function makeSelectionManager(selectedIds: string[] = []): SelectionManager {
  const selected = new Set(selectedIds);
  return {
    isSelected: vi.fn((id: string) => selected.has(id)),
    getSelectedIds: vi.fn(() => Array.from(selected)),
    getActorId: vi.fn(() => 'me'),
  } as unknown as SelectionManager;
}

describe('DragManager', () => {
  let drag: DragManager;

  beforeEach(() => {
    drag = new DragManager();
  });

  // ── Behavioral contract: "reset drag prep but preserve unstack waiting" ──
  // This is the contract at pointer.ts:292 — after sending an unstack message,
  // drag prep must be cleared but unstack waiting must survive for the async
  // objects-added handler.
  describe('resetDragPrep preserves unstack waiting', () => {
    it('clears drag preparation state', () => {
      drag.prepareUnstackDrag('stack-1', 100, 200);
      drag.setPhantomDragActive(true);

      drag.resetDragPrep();

      expect(drag.isDragging()).toBe(false);
      expect(drag.getDraggedObjectId()).toBeNull();
      expect(drag.isUnstackDragActive()).toBe(false);
    });

    it('does NOT clear unstack waiting state', () => {
      drag.setWaitingForUnstackResponse('stack-1', vi.fn());

      drag.resetDragPrep();

      expect(drag.isWaitingForUnstackFrom('stack-1')).toBe(true);
      expect(drag.getUnstackSourceId()).toBe('stack-1');
    });
  });

  // ── Behavioral contract: "reset everything" ──
  // This is the contract at objects.ts:238 (scene clear) and the cancel sites
  // (pinch, rect-select, pan, object removed).
  describe('resetAll clears all state', () => {
    it('clears drag preparation state', () => {
      drag.prepareObjectDrag('obj-1', 10, 20);
      drag.setPhantomDragActive(true);

      drag.resetAll();

      expect(drag.isDragging()).toBe(false);
      expect(drag.getDraggedObjectId()).toBeNull();
      expect(drag.isUnstackDragActive()).toBe(false);
    });

    it('clears unstack waiting state', () => {
      drag.setWaitingForUnstackResponse('stack-1', vi.fn());

      drag.resetAll();

      expect(drag.isWaitingForUnstackFrom('stack-1')).toBe(false);
      expect(drag.getUnstackSourceId()).toBeNull();
    });
  });

  // ── endObjectDrag: returns position updates and clears drag state ──
  describe('endObjectDrag', () => {
    it('returns position updates for dragged objects', () => {
      const sm = makeSceneManager({
        'obj-1': { x: 50, y: 60, r: 0 },
      });
      const sel = makeSelectionManager();

      drag.prepareObjectDrag('obj-1', 0, 0);
      drag.startObjectDrag(sm, sel);

      const updates = drag.endObjectDrag(sm);

      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe('obj-1');
      expect(updates[0].pos).toEqual({ x: 50, y: 60, r: 0 });
    });

    it('clears isDragging after ending', () => {
      const sm = makeSceneManager({ 'obj-1': { x: 0, y: 0 } });
      const sel = makeSelectionManager();

      drag.prepareObjectDrag('obj-1', 0, 0);
      drag.startObjectDrag(sm, sel);
      expect(drag.isDragging()).toBe(true);

      drag.endObjectDrag(sm);
      expect(drag.isDragging()).toBe(false);
    });

    it('returns empty array when not dragging', () => {
      const sm = makeSceneManager();
      expect(drag.endObjectDrag(sm)).toEqual([]);
    });

    it('clears isUnstackDrag after unstack drag ends', () => {
      const sm = makeSceneManager({ 'obj-1': { x: 0, y: 0 } });
      const sel = makeSelectionManager();

      drag.prepareUnstackDrag('obj-1', 0, 0);
      drag.startObjectDrag(sm, sel);
      expect(drag.isUnstackDragActive()).toBe(true);

      drag.endObjectDrag(sm);
      expect(drag.isUnstackDragActive()).toBe(false);
    });
  });

  // ── Drop holds: ignore the pre-drag position after a drop ──
  describe('drop holds', () => {
    function dropObjectAt(
      id: string,
      from: { x: number; y: number },
      to: { x: number; y: number },
    ): void {
      const sm = makeSceneManager({ [id]: from });
      drag.prepareObjectDrag(id, 0, 0);
      drag.startObjectDrag(sm, makeSelectionManager());
      const obj = sm.getObject(id);
      if (obj) {
        obj._pos.x = to.x;
        obj._pos.y = to.y;
      }
      drag.endObjectDrag(sm);
    }

    it('treats the pre-drag position as a leftover until another position arrives', () => {
      dropObjectAt('obj-1', { x: 0, y: 0 }, { x: 50, y: 0 });

      expect(drag.isPreMoveLeftover('obj-1', 0, 0)).toBe(true);
      expect(drag.isPreMoveLeftover('obj-1', 0, 0)).toBe(true);
      expect(drag.isPreMoveLeftover('obj-1', 50, 0)).toBe(false);
      expect(drag.isPreMoveLeftover('obj-1', 0, 0)).toBe(false);
    });

    it('records no hold for a drop that ends at its start position', () => {
      dropObjectAt('obj-1', { x: 0, y: 0 }, { x: 0, y: 0 });

      expect(drag.isPreMoveLeftover('obj-1', 0, 0)).toBe(false);
      expect(drag.isPreMoveLeftover('obj-1', 50, 0)).toBe(false);
    });

    it('records no hold when grid snap returns the dropped card to its start position', () => {
      // pointer.ts snaps _pos before endObjectDrag, so it sees the snapped final position
      dropObjectAt('obj-1', { x: 100, y: 100 }, { x: 100, y: 100 });

      expect(drag.isPreMoveLeftover('obj-1', 100, 100)).toBe(false);
    });

    it('holds the off-grid start when the snapped drop differs from it', () => {
      dropObjectAt('obj-1', { x: 103, y: 97 }, { x: 200, y: 100 });

      expect(drag.isPreMoveLeftover('obj-1', 103, 97)).toBe(true);
      expect(drag.isPreMoveLeftover('obj-1', 200, 100)).toBe(false);
      expect(drag.isPreMoveLeftover('obj-1', 103, 97)).toBe(false);
    });

    it('clears holds on resetAll', () => {
      dropObjectAt('obj-1', { x: 0, y: 0 }, { x: 50, y: 0 });

      drag.resetAll();

      expect(drag.isPreMoveLeftover('obj-1', 0, 0)).toBe(false);
    });

    it('clears holds on clearDropHolds', () => {
      dropObjectAt('obj-1', { x: 0, y: 0 }, { x: 50, y: 0 });

      drag.clearDropHolds();

      expect(drag.isPreMoveLeftover('obj-1', 0, 0)).toBe(false);
    });
  });

  // ── Unstack waiting lifecycle ──
  describe('unstack waiting lifecycle', () => {
    it('tracks waiting state for a source stack', () => {
      drag.setWaitingForUnstackResponse('stack-1', vi.fn());

      expect(drag.isWaitingForUnstackFrom('stack-1')).toBe(true);
      expect(drag.isWaitingForUnstackFrom('stack-2')).toBe(false);
      expect(drag.getUnstackSourceId()).toBe('stack-1');
    });

    it('clearUnstackWaiting resets waiting state', () => {
      drag.setWaitingForUnstackResponse('stack-1', vi.fn());

      drag.clearUnstackWaiting();

      expect(drag.isWaitingForUnstackFrom('stack-1')).toBe(false);
      expect(drag.getUnstackSourceId()).toBeNull();
    });

    it('timeout calls onTimeout and clears waiting state', () => {
      vi.useFakeTimers();
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const onTimeout = vi.fn();

      drag.setWaitingForUnstackResponse('stack-1', onTimeout);
      vi.advanceTimersByTime(2000);

      expect(onTimeout).toHaveBeenCalledOnce();
      expect(drag.getUnstackSourceId()).toBeNull();

      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('clearUnstackWaiting cancels pending timeout', () => {
      vi.useFakeTimers();
      const onTimeout = vi.fn();

      drag.setWaitingForUnstackResponse('stack-1', onTimeout);
      drag.clearUnstackWaiting();
      vi.advanceTimersByTime(2000);

      expect(onTimeout).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // ── startObjectDrag multi-select behavior via modifiers param ──
  describe('startObjectDrag multi-select behavior', () => {
    it('drags all selected objects when dragging a selected object', () => {
      const sm = makeSceneManager({
        'obj-1': { x: 0, y: 0 },
        'obj-2': { x: 10, y: 10 },
      });
      const sel = makeSelectionManager(['obj-1', 'obj-2']);

      drag.prepareObjectDrag('obj-1', 0, 0);
      const dragged = drag.startObjectDrag(sm, sel);

      expect(dragged).toContain('obj-1');
      expect(dragged).toContain('obj-2');
    });

    it('drags only clicked object when unselected and no modifier', () => {
      const sm = makeSceneManager({
        'obj-1': { x: 0, y: 0 },
        'obj-2': { x: 10, y: 10 },
      });
      const sel = makeSelectionManager(['obj-2']);

      drag.prepareObjectDrag('obj-1', 0, 0);
      const dragged = drag.startObjectDrag(sm, sel);

      expect(dragged).toEqual(['obj-1']);
    });

    it('adds to selection when unselected with metaKey modifier', () => {
      const sm = makeSceneManager({
        'obj-1': { x: 0, y: 0 },
        'obj-2': { x: 10, y: 10 },
      });
      const sel = makeSelectionManager(['obj-2']);

      drag.prepareObjectDrag('obj-1', 0, 0);
      const dragged = drag.startObjectDrag(sm, sel, { metaKey: true });

      expect(dragged).toContain('obj-1');
      expect(dragged).toContain('obj-2');
    });
  });

  // ── Dragging a zone carries what rests in it ──
  describe('startObjectDrag zone carry', () => {
    const Z = ObjectKind.Zone;
    // Zone at (0,0), 200x100 -> box x[-100,100], y[-50,50]
    const zone = {
      x: 0,
      y: 0,
      kind: Z,
      meta: { width: 200, height: 100 },
    };

    function dragZone(
      objects: Parameters<typeof makeSceneManager>[0],
      selected: string[] = [],
      id = 'zone',
    ): string[] {
      const sm = makeSceneManager(objects);
      drag.prepareObjectDrag(id, 0, 0);
      return drag.startObjectDrag(sm, makeSelectionManager(selected));
    }

    it('carries a stack whose center is inside, not one 1px outside', () => {
      const dragged = dragZone({
        zone,
        inside: { x: 100, y: 50 },
        outside: { x: 101, y: 0 },
      });
      expect(dragged).toContain('inside');
      expect(dragged).not.toContain('outside');
    });

    it('carries tokens and mats with centers inside', () => {
      const dragged = dragZone({
        zone,
        tok: { x: 10, y: 10, kind: ObjectKind.Token },
        mat: { x: -20, y: 5, kind: ObjectKind.Mat },
      });
      expect(dragged).toEqual(expect.arrayContaining(['zone', 'tok', 'mat']));
    });

    it('carries an attached child of a carried parent even if it is outside', () => {
      const dragged = dragZone({
        zone,
        parent: { x: 0, y: 0, attachedCardIds: ['child'] },
        child: { x: 150, y: 0, attachedToId: 'parent' },
      });
      expect(dragged).toContain('parent');
      expect(dragged).toContain('child');
    });

    it('does not carry an attached child whose parent is outside', () => {
      const dragged = dragZone({
        zone,
        parent: { x: 500, y: 0, attachedCardIds: ['child'] },
        child: { x: 0, y: 0, attachedToId: 'parent' },
      });
      expect(dragged).not.toContain('child');
      expect(dragged).not.toContain('parent');
    });

    it("skips objects held by another actor but carries the actor's own", () => {
      const dragged = dragZone({
        zone,
        theirs: { x: 0, y: 0, selectedBy: 'other-actor' },
        mine: { x: 10, y: 0, selectedBy: 'me' },
      });
      expect(dragged).not.toContain('theirs');
      expect(dragged).toContain('mine');
    });

    it('carries a nested zone and its contents', () => {
      const dragged = dragZone({
        zone,
        small: { x: 0, y: 0, kind: Z, meta: { width: 50, height: 50 } },
        pile: { x: 5, y: 5 },
      });
      expect(dragged).toEqual(expect.arrayContaining(['small', 'pile']));
    });

    it('does not carry the enclosing zone when dragging the inner one', () => {
      const dragged = dragZone(
        {
          big: { ...zone },
          small: { x: 0, y: 0, kind: Z, meta: { width: 50, height: 50 } },
        },
        [],
        'small',
      );
      expect(dragged).toEqual(['small']);
    });

    it('does not carry a zone that only partly overlaps', () => {
      const dragged = dragZone({
        zone,
        overlap: { x: 90, y: 0, kind: Z, meta: { width: 100, height: 50 } },
      });
      expect(dragged).not.toContain('overlap');
    });

    it('has no duplicate ids when the zone and its pile are both selected', () => {
      const dragged = dragZone({ zone, pile: { x: 0, y: 0 } }, [
        'zone',
        'pile',
      ]);
      expect(dragged).toHaveLength(2);
      expect(new Set(dragged).size).toBe(2);
    });

    it('leaves a non-zone drag unchanged', () => {
      const dragged = dragZone(
        { zone, card: { x: 0, y: 0 }, other: { x: 5, y: 5 } },
        [],
        'card',
      );
      expect(dragged).toEqual(['card']);
    });
  });
});

// ── GestureRecognizer: pointerDownEvent lifecycle ──
// pointerDownEvent was moved from DragManager to GestureRecognizer because
// it's pointer-event state, not drag state.
describe('GestureRecognizer pointerDownEvent', () => {
  let gestures: GestureRecognizer;

  beforeEach(() => {
    gestures = new GestureRecognizer();
  });

  it('stores and retrieves pointer event', () => {
    const event = makePointerEvent({ clientX: 100, metaKey: true });

    gestures.setPointerDownEvent(event);

    const stored = gestures.getPointerDownEvent();
    expect(stored).toBe(event);
    expect(stored?.metaKey).toBe(true);
  });

  it('returns null when not set', () => {
    expect(gestures.getPointerDownEvent()).toBeNull();
  });

  it('clearPointerDownEvent removes stored event', () => {
    gestures.setPointerDownEvent(makePointerEvent());
    gestures.clearPointerDownEvent();
    expect(gestures.getPointerDownEvent()).toBeNull();
  });

  it('clear() also clears pointerDownEvent', () => {
    gestures.setPointerDownEvent(makePointerEvent());
    gestures.clear();
    expect(gestures.getPointerDownEvent()).toBeNull();
  });
});
