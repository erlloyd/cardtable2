import { describe, it, expect, vi } from 'vitest';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import { HoverManager } from '../managers/HoverManager';
import type { RendererContext } from '../RendererContext';
import { handlePointerLeave, handlePointerMove } from './pointer';
import { DragManager } from '../managers/DragManager';
import { ObjectKind } from '@cardtable2/shared';

/**
 * Build a minimal RendererContext mock sufficient for handlePointerLeave.
 *
 * handlePointerLeave only touches: hover, selection.isSelected, visual.updateVisualFeedback,
 * sceneManager, app.renderer.render, app.stage, postResponse.
 *
 * We use a real HoverManager to exercise its state machine, and stub the rest as
 * just-enough no-ops. The cast to RendererContext is intentional — we are
 * deliberately providing only the slice the handler uses.
 */
function buildMockContext(initialHoveredId: string | null): {
  context: RendererContext;
  postResponse: ReturnType<typeof vi.fn>;
  updateVisualFeedback: ReturnType<typeof vi.fn>;
  hover: HoverManager;
} {
  const hover = new HoverManager();
  if (initialHoveredId) {
    hover.setHoveredObject(initialHoveredId);
  }
  const postResponse = vi.fn<(msg: RendererToMainMessage) => void>();
  const updateVisualFeedback = vi.fn();
  const render = vi.fn();

  const context = {
    hover,
    selection: {
      isSelected: () => false,
    },
    visual: {
      updateVisualFeedback,
    },
    sceneManager: {},
    app: {
      stage: {},
      renderer: { render },
    },
    postResponse,
  } as unknown as RendererContext;

  return { context, postResponse, updateVisualFeedback, hover };
}

describe('handlePointerLeave - ct-zqc fix', () => {
  const leaveMessage = {
    type: 'pointer-leave',
  } as Extract<MainToRendererMessage, { type: 'pointer-leave' }>;

  it('posts object-hovered with objectId=null when an object was hovered', () => {
    const { context, postResponse } = buildMockContext('stack-1');

    handlePointerLeave(leaveMessage, context);

    expect(postResponse).toHaveBeenCalledWith({
      type: 'object-hovered',
      objectId: null,
      isFaceUp: false,
    });
  });

  it('posts object-hovered with objectId=null even when nothing was hovered', () => {
    // Without this, the next pointermove on canvas can't break the null===null
    // short-circuit in HoverManager.setHoveredObject (the bug that ct-zqc fixes).
    const { context, postResponse } = buildMockContext(null);

    handlePointerLeave(leaveMessage, context);

    expect(postResponse).toHaveBeenCalledWith({
      type: 'object-hovered',
      objectId: null,
      isFaceUp: false,
    });
  });

  it('clears internal hover state and updates visual feedback when an object was hovered', () => {
    const { context, hover, updateVisualFeedback } =
      buildMockContext('stack-1');

    handlePointerLeave(leaveMessage, context);

    expect(hover.getHoveredObjectId()).toBe(null);
    expect(updateVisualFeedback).toHaveBeenCalledWith(
      'stack-1',
      false,
      false,
      expect.anything(),
    );
  });

  it('only posts a single object-hovered message per leave', () => {
    const { context, postResponse } = buildMockContext('stack-1');

    handlePointerLeave(leaveMessage, context);

    expect(postResponse).toHaveBeenCalledTimes(1);
  });
});

describe('handlePointerMove - locked objects', () => {
  const moveMessage = {
    type: 'pointer-move',
    event: {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
      isPrimary: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    },
  } as Extract<MainToRendererMessage, { type: 'pointer-move' }>;

  function buildMoveContext(
    interactionMode: 'select' | 'pan',
    unstack: boolean,
  ) {
    const drag = new DragManager();
    if (unstack) {
      drag.prepareUnstackDrag('s1', 0, 0);
    } else {
      drag.prepareObjectDrag('s1', 0, 0);
    }
    const postResponse = vi.fn<(msg: RendererToMainMessage) => void>();
    const startPan = vi.fn();
    const startRectangleSelect = vi.fn();
    const context = {
      interactionMode,
      drag,
      postResponse,
      gestures: {
        getPointer: () => ({ lastX: 0, lastY: 0 }),
        updatePointer: vi.fn(),
        getPointerCount: () => 1,
        exceedsDragSlop: () => true,
        getPointerDownEvent: () => null,
        getAllPointers: () => new Map(),
      },
      camera: {
        isPinchingActive: () => false,
        isPanningActive: () => false,
        startPan,
      },
      rectangleSelect: {
        isSelecting: () => false,
        startRectangleSelect,
      },
      selection: {
        getSelectedIds: () => [],
        isSelected: () => false,
        getActorId: () => 'me',
      },
      hover: new HoverManager(),
      coordConverter: { screenToWorld: () => ({ x: 0, y: 0 }) },
      worldContainer: {},
      sceneManager: {
        getObject: () => ({
          _id: 's1',
          _kind: ObjectKind.Stack,
          _pos: { x: 0, y: 0, r: 0 },
          _locked: true,
        }),
      },
      app: { stage: {}, renderer: { render: vi.fn() } },
    } as unknown as RendererContext;
    return { context, drag, postResponse, startPan, startRectangleSelect };
  }

  it('pans instead of dragging a locked stack in pan mode', () => {
    const { context, drag, postResponse, startPan, startRectangleSelect } =
      buildMoveContext('pan', false);

    handlePointerMove(moveMessage, context);

    expect(drag.isDragging()).toBe(false);
    expect(startPan).toHaveBeenCalled();
    expect(startRectangleSelect).not.toHaveBeenCalled();
    expect(postResponse).not.toHaveBeenCalledWith({
      type: 'object-drag-started',
    });
  });

  it('rectangle-selects instead of dragging a locked stack in select mode', () => {
    const { context, drag, startPan, startRectangleSelect } = buildMoveContext(
      'select',
      false,
    );

    handlePointerMove(moveMessage, context);

    expect(drag.isDragging()).toBe(false);
    expect(startRectangleSelect).toHaveBeenCalled();
    expect(startPan).not.toHaveBeenCalled();
  });

  it('still unstacks from a locked stack via the unstack handle', () => {
    const { context, postResponse, startPan, startRectangleSelect } =
      buildMoveContext('select', true);

    handlePointerMove(moveMessage, context);

    expect(postResponse).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unstack-card', stackId: 's1' }),
    );
    expect(startPan).not.toHaveBeenCalled();
    expect(startRectangleSelect).not.toHaveBeenCalled();
  });
});
