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

function setup(
  prev: StackObject,
  draggedIds: string[],
  prevById: Record<string, StackObject> = {},
) {
  const updateObject = vi.fn();
  const visual = { x: 0, y: 0, rotation: 0 };
  const context = {
    visual: {
      getVisual: () => visual,
      updateVisualForObjectChange: vi.fn(),
    },
    sceneManager: {
      getObject: (id: string) => prevById[id] ?? prev,
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

  it('keeps each dragged object its own x/y in a multi-select batch and updates the rest', () => {
    const prev1 = makeStack(300, 400, 0);
    const prev2 = makeStack(500, 600, 0);
    const prev3 = makeStack(700, 800, 0);
    const { context, updateObject } = setup(prev1, ['s1', 's2'], {
      s1: prev1,
      s2: prev2,
      s3: prev3,
    });

    handleObjectsUpdated(
      {
        type: 'objects-updated',
        objects: [
          { id: 's1', obj: makeStack(10, 20, 0) },
          { id: 's2', obj: makeStack(30, 40, 90) },
          { id: 's3', obj: makeStack(50, 60, 0) },
        ],
      },
      context,
    );

    const applied = new Map(
      updateObject.mock.calls.map(
        (c) => [c[0] as string, (c[1] as StackObject)._pos] as const,
      ),
    );
    expect(applied.get('s1')).toEqual({ x: 300, y: 400, r: 0 });
    expect(applied.get('s2')).toEqual({ x: 500, y: 600, r: 90 });
    expect(applied.get('s3')).toEqual({ x: 50, y: 60, r: 0 });
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
