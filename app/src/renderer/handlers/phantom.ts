/**
 * Phantom drag handlers for hand-to-board card transfer.
 *
 * When a player drags a card from their hand panel toward the board,
 * these handlers process the phantom position updates to provide
 * stack target detection and grid snap feedback.
 */

import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { getBehaviors } from '../objects';
import { snapToGrid } from '../../utils/gridSnap';

let isPhantomDragActive = false;
let lastStackTargetId: string | null = null;

export function handlePhantomDragStart(
  _message: Extract<MainToRendererMessage, { type: 'phantom-drag-start' }>,
  _context: RendererContext,
): void {
  isPhantomDragActive = true;
  lastStackTargetId = null;
}

export function handlePhantomDragMove(
  message: Extract<MainToRendererMessage, { type: 'phantom-drag-move' }>,
  context: RendererContext,
): void {
  if (!isPhantomDragActive) return;

  // Convert canvas coords to world coords
  const worldPos = context.coordConverter.screenToWorld(
    message.canvasX,
    message.canvasY,
    context.worldContainer,
  );

  // Detect stack target (simplified — no excluded IDs since card isn't on board)
  let stackTargetId: string | undefined;
  const hitResult = context.sceneManager.hitTest(worldPos.x, worldPos.y);

  if (hitResult) {
    const targetObj = context.sceneManager.getObject(hitResult.id);
    if (targetObj) {
      const behaviors = getBehaviors(targetObj._kind);
      if (behaviors.capabilities.canStack) {
        stackTargetId = hitResult.id;
      }
    }
  }

  // Update stack target visual feedback
  if (stackTargetId) {
    const isSelected = context.selection.isSelected(stackTargetId);
    context.visual.updateStackTargetFeedback(
      stackTargetId,
      true,
      isSelected,
      context.sceneManager,
    );
  } else if (lastStackTargetId) {
    context.visual.updateStackTargetFeedback(
      '',
      false,
      false,
      context.sceneManager,
    );
  }
  lastStackTargetId = stackTargetId ?? null;

  // Calculate snap position if grid snap is enabled
  let snapPos: { x: number; y: number } | undefined;
  if (context.gridSnapEnabled) {
    const snapped = snapToGrid({ x: worldPos.x, y: worldPos.y }, true);
    snapPos = snapped;
  }

  // Send feedback to main thread
  context.postResponse({
    type: 'phantom-drag-feedback',
    worldX: worldPos.x,
    worldY: worldPos.y,
    snapPos,
    stackTargetId,
  });
}

export function handlePhantomDragEnd(
  _message: Extract<MainToRendererMessage, { type: 'phantom-drag-end' }>,
  context: RendererContext,
): void {
  if (!isPhantomDragActive) return;

  isPhantomDragActive = false;

  // Clear stack target feedback
  if (lastStackTargetId) {
    context.visual.updateStackTargetFeedback(
      '',
      false,
      false,
      context.sceneManager,
    );
    lastStackTargetId = null;
  }

  // Clear grid snap ghosts
  context.gridSnap.clearGhosts();
}
