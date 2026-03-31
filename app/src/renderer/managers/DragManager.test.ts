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
    { x: number; y: number; r?: number; kind?: number; sortKey?: string }
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
        _selectedBy: null,
        _meta: {},
      },
    ]),
  );

  return {
    getObject: vi.fn((id: string) => store.get(id)),
    updateObject: vi.fn(),
    removeSpatialEntries: vi.fn(),
  } as unknown as SceneManager;
}

function makeSelectionManager(selectedIds: string[] = []): SelectionManager {
  const selected = new Set(selectedIds);
  return {
    isSelected: vi.fn((id: string) => selected.has(id)),
    getSelectedIds: vi.fn(() => selected),
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
      const onTimeout = vi.fn();

      drag.setWaitingForUnstackResponse('stack-1', onTimeout);
      vi.advanceTimersByTime(2000);

      expect(onTimeout).toHaveBeenCalledOnce();
      expect(drag.getUnstackSourceId()).toBeNull();

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
