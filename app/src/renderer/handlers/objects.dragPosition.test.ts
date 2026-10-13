import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ObjectKind, type StackObject } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { handleObjectsUpdated } from './objects';

function makeStack(x: number, y: number, r: number): StackObject {
  return {
    _kind: ObjectKind.Stack,
    _containerId: null,
    _pos: { x, y, r },
    _sortKey: '1',
    _locked: false,
    _selectedBy: null,
    _meta: {},
    _cards: [{ code: 'a' }],
    _faceUp: true,
  };
}

function setup(prev: StackObject, draggedIds: string[]) {
  const updateObject = vi.fn();
  const visual = { x: 0, y: 0, rotation: 0 };
  const context = {
    visual: {
      getVisual: () => visual,
      updateVisualForObjectChange: vi.fn(),
    },
    sceneManager: {
      getObject: () => prev,
      updateObject,
      getAllObjects: () => new Map(),
    },
    drag: { getDraggedObjectIds: () => draggedIds },
    hover: { getHoveredObjectId: () => null },
    selection: { isSelected: () => false },
    animation: {
      animateShuffle: vi.fn(),
      animateFlip: vi.fn(),
      animate: vi.fn(),
      isShuffling: () => false,
    },
    worldContainer: { children: [] },
    app: { renderer: { render: vi.fn() }, stage: {} },
  } as unknown as RendererContext;
  return { context, updateObject, visual };
}

describe('handleObjectsUpdated - position during drag', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the in-memory drag x/y but takes the incoming rotation for a dragged object', () => {
    const prev = makeStack(300, 400, 0);
    const stale = makeStack(10, 20, 90);
    const { context, updateObject } = setup(prev, ['s1']);

    handleObjectsUpdated(
      { type: 'objects-updated', objects: [{ id: 's1', obj: stale }] },
      context,
    );

    const applied = updateObject.mock.calls[0][1] as StackObject;
    expect(applied._pos).toEqual({ x: 300, y: 400, r: 90 });
  });

  it('takes the incoming position for a non-dragged object', () => {
    const prev = makeStack(300, 400, 0);
    const next = makeStack(10, 20, 90);
    const { context, updateObject, visual } = setup(prev, []);

    handleObjectsUpdated(
      { type: 'objects-updated', objects: [{ id: 's1', obj: next }] },
      context,
    );

    const applied = updateObject.mock.calls[0][1] as StackObject;
    expect(applied._pos).toEqual({ x: 10, y: 20, r: 90 });
    expect(visual.x).toBe(10);
    expect(visual.y).toBe(20);
  });
});
