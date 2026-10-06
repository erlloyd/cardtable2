import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ObjectKind,
  type CardEntry,
  type StackObject,
} from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { handleObjectsUpdated } from './objects';

function makeStack(cards: CardEntry[], faceUp = true): StackObject {
  return {
    _kind: ObjectKind.Stack,
    _containerId: null,
    _pos: { x: 0, y: 0, r: 0 },
    _sortKey: '1',
    _locked: false,
    _selectedBy: null,
    _meta: {},
    _cards: cards,
    _faceUp: faceUp,
  };
}

// Objects reach the renderer as fresh clones (toJSON + postMessage), so no
// entry object is ever reference-equal to one in the previous state.
function clone(obj: StackObject): StackObject {
  return structuredClone(obj);
}

function setup(prev: StackObject) {
  const animateShuffle = vi.fn();
  const animateFlip = vi.fn();
  const updateVisualForObjectChange = vi.fn();
  const context = {
    visual: {
      getVisual: () => ({ x: 0, y: 0, rotation: 0 }),
      updateVisualForObjectChange,
    },
    sceneManager: {
      getObject: () => prev,
      updateObject: vi.fn(),
      getAllObjects: () => new Map(),
    },
    drag: { getDraggedObjectIds: () => [] },
    hover: { getHoveredObjectId: () => null },
    selection: { isSelected: () => false },
    animation: {
      animateShuffle,
      animateFlip,
      animate: vi.fn(),
      isShuffling: () => false,
    },
    worldContainer: { children: [] },
    app: { renderer: { render: vi.fn() }, stage: {} },
  } as unknown as RendererContext;
  return { context, animateShuffle, animateFlip };
}

describe('handleObjectsUpdated - shuffle detection with CardEntry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const a: CardEntry = { code: 'a', homeZone: 'z1' };
  const b: CardEntry = { code: 'b', homeZone: 'z2' };
  const c: CardEntry = { code: 'c' };

  it('reports a shuffle for a reorder of distinct-clone entries', () => {
    const prev = makeStack([a, b, c]);
    const next = clone(makeStack([c, a, b]));
    const { context, animateShuffle, animateFlip } = setup(prev);

    handleObjectsUpdated(
      { type: 'objects-updated', objects: [{ id: 's1', obj: next }] },
      context,
    );

    expect(animateShuffle).toHaveBeenCalledTimes(1);
    expect(animateFlip).not.toHaveBeenCalled();
  });

  it('does not report a shuffle when the order is unchanged', () => {
    const prev = makeStack([a, b, c]);
    const next = clone(prev);
    const { context, animateShuffle } = setup(prev);

    handleObjectsUpdated(
      { type: 'objects-updated', objects: [{ id: 's1', obj: next }] },
      context,
    );

    expect(animateShuffle).not.toHaveBeenCalled();
  });

  it('does not report a shuffle for a flip (reversed order + faceUp change)', () => {
    const prev = makeStack([a, b, c], true);
    const next = clone(makeStack([c, b, a], false));
    const { context, animateShuffle, animateFlip } = setup(prev);

    handleObjectsUpdated(
      { type: 'objects-updated', objects: [{ id: 's1', obj: next }] },
      context,
    );

    expect(animateFlip).toHaveBeenCalledTimes(1);
    expect(animateShuffle).not.toHaveBeenCalled();
  });
});
