import { describe, it, expect, vi } from 'vitest';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import { HoverManager } from '../managers/HoverManager';
import type { RendererContext } from '../RendererContext';
import { handlePointerLeave } from './pointer';

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
