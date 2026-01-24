/**
 * Object management handlers
 *
 * Handles object synchronization, addition, updates, and removal.
 * Creates and manages PixiJS visuals for TableObjects.
 */

import type { MainToRendererMessage, TableObject } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { Easing } from '../managers';
import {
  SHUFFLE_DETECT_INVALID_ARRAY,
  SHUFFLE_DETECT_FAILED,
  FLIP_MIDPOINT_FAILED,
  FLIP_COMPLETE_FAILED,
  SHUFFLE_COMPLETE_FAILED,
} from '../../constants/errorIds';

/**
 * Handle sync-objects message
 *
 * Clears all existing objects and adds new ones from the store.
 * Used for initial sync and full resync operations.
 */
export function handleSyncObjects(
  message: Extract<MainToRendererMessage, { type: 'sync-objects' }>,
  context: RendererContext,
): void {
  console.log(
    `[RendererCore] Syncing ${message.objects.length} objects from store`,
  );

  clearObjects(context);

  for (const { id, obj } of message.objects) {
    context.visual.addObject(
      id,
      obj,
      context.sceneManager,
      context.worldContainer,
    );
  }

  context.app.renderer.render(context.app.stage);
}

/**
 * Handle objects-added message
 *
 * Adds new objects to the scene.
 */
export function handleObjectsAdded(
  message: Extract<MainToRendererMessage, { type: 'objects-added' }>,
  context: RendererContext,
): void {
  console.log(`[RendererCore] Adding ${message.objects.length} object(s)`);

  for (const { id, obj } of message.objects) {
    context.visual.addObject(
      id,
      obj,
      context.sceneManager,
      context.worldContainer,
    );

    // Check if this object is being remotely dragged - hide it immediately (only ghost should show)
    if (context.awareness.isObjectRemotelyDragged(id)) {
      context.visual.hideObject(id);
    }

    // Check if this is the new stack from an unstack operation
    const unstackSourceId = context.drag.getUnstackSourceId();
    if (unstackSourceId) {
      // Clear waiting state
      context.drag.clearUnstackWaiting();

      // Clear stale drag visual feedback from source stack
      context.visual.updateDragFeedback(
        unstackSourceId,
        false, // isDragging = false
        false, // isSelected = false (will be deselected by main thread)
        context.sceneManager,
      );

      // Prepare drag for the new stack at its current position
      context.drag.prepareObjectDrag(id, obj._pos.x, obj._pos.y);

      // Start dragging immediately
      context.postResponse({ type: 'object-drag-started' });
      const draggedIds = context.drag.startObjectDrag(
        context.sceneManager,
        context.selection,
      );

      // Apply drag visual feedback to new stack
      for (const objectId of draggedIds) {
        const isSelected = context.selection.isSelected(objectId);
        context.visual.updateDragFeedback(
          objectId,
          true,
          isSelected,
          context.sceneManager,
        );
      }

      // Send selection message for new stack (this will unselect source stack via main thread)
      const screenCoords = draggedIds.map((objectId) => {
        return {
          id: objectId,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        };
      });
      context.postResponse({
        type: 'objects-selected',
        ids: draggedIds,
        screenCoords,
      });
    }
  }

  context.app.renderer.render(context.app.stage);
}

/**
 * Handle objects-updated message
 *
 * Updates existing objects in the scene.
 */
export function handleObjectsUpdated(
  message: Extract<MainToRendererMessage, { type: 'objects-updated' }>,
  context: RendererContext,
): void {
  console.log(`[RendererCore] Updating ${message.objects.length} object(s)`);

  for (const { id, obj } of message.objects) {
    updateObjectVisual(context, id, obj);
  }

  context.app.renderer.render(context.app.stage);
}

/**
 * Handle objects-removed message
 *
 * Removes objects from the scene.
 */
export function handleObjectsRemoved(
  message: Extract<MainToRendererMessage, { type: 'objects-removed' }>,
  context: RendererContext,
): void {
  console.log(`[RendererCore] Removing ${message.ids.length} object(s)`);

  for (const id of message.ids) {
    // Remove visual via VisualManager
    context.visual.removeObject(
      id,
      context.sceneManager,
      context.worldContainer,
    );

    // Clear selection if this object was selected
    if (context.selection.isSelected(id)) {
      context.selection.clearSelection(id);

      // Notify Board to clear screen coordinates for this deleted object
      context.postResponse({
        type: 'objects-unselected',
        ids: [id],
      });
    }

    // Clear hover if this object was hovered
    if (context.hover.getHoveredObjectId() === id) {
      context.hover.clearAll();
    }

    // Clear drag if this object was being dragged
    if (context.drag.getDraggedObjectId() === id) {
      context.drag.cancelObjectDrag();
    }
  }

  // Render after removing
  context.app.renderer.render(context.app.stage);
}

/**
 * Handle clear-objects message
 *
 * Clears all objects from the scene.
 */
export function handleClearObjects(
  _message: Extract<MainToRendererMessage, { type: 'clear-objects' }>,
  context: RendererContext,
): void {
  console.log('[RendererCore] Clearing all objects');

  clearObjects(context);

  // Render after clearing
  context.app.renderer.render(context.app.stage);
}

/**
 * Helper: Clear all object visuals
 *
 * Removes all visuals from world container and clears all data structures.
 */
function clearObjects(context: RendererContext): void {
  // Remove all visuals from world container and destroy them
  for (const [, visual] of context.visual.getAllVisuals()) {
    context.worldContainer.removeChild(visual);
    visual.destroy();
  }

  // Clear data structures
  context.visual.clear(context.worldContainer);
  context.sceneManager.clear();
  context.selection.clearAll();
  context.hover.clearAll();
  context.drag.clear();
}

/**
 * Helper: Update an existing object visual
 *
 * Updates position, rotation, and potentially re-renders if kind/meta changed.
 */
function updateObjectVisual(
  context: RendererContext,
  id: string,
  obj: TableObject,
): void {
  const visual = context.visual.getVisual(id);
  if (!visual) {
    console.warn(`[RendererCore] Visual for object ${id} not found`);
    return;
  }

  // Get previous object state to detect flip changes
  const prevObj = context.sceneManager.getObject(id);

  // Update scene manager
  context.sceneManager.updateObject(id, obj);

  // Check if this object is being dragged (primary or secondary in multi-drag)
  const isDragging = context.drag.getDraggedObjectIds().includes(id);

  // Update visual position and rotation
  // Position is preserved during drag to avoid flashing, but rotation should always update
  // to allow exhaust/flip during drag
  if (!isDragging) {
    visual.x = obj._pos.x;
    visual.y = obj._pos.y;
  }

  // Query state once for efficiency (reused in callbacks and non-flip path)
  // Note: Callbacks capture the state at animation start, which is correct behavior
  // (hover/selection changes during animation should not affect the animation)
  const isHovered = context.hover.getHoveredObjectId() === id;
  const isSelected = context.selection.isSelected(id);

  // Detect _faceUp changes (flip) and animate
  const hasFaceUp = '_faceUp' in obj && typeof obj._faceUp === 'boolean';
  const prevHasFaceUp =
    prevObj && '_faceUp' in prevObj && typeof prevObj._faceUp === 'boolean';
  const faceUpChanged =
    hasFaceUp &&
    prevHasFaceUp &&
    (obj as { _faceUp: boolean })._faceUp !==
      (prevObj as { _faceUp: boolean })._faceUp;

  // Detect shuffle BEFORE visual update to prevent destroying ghost rectangles
  // Skip shuffle detection if flip is occurring (flip has its own animation)
  const hasCards = '_cards' in obj && Array.isArray(obj._cards);
  const prevHasCards =
    prevObj && '_cards' in prevObj && Array.isArray(prevObj._cards);

  let isShuffle = false;
  if (hasCards && prevHasCards && !faceUpChanged) {
    try {
      const currentCards = (obj as { _cards: string[] })._cards;
      const prevCards = (prevObj as { _cards: string[] })._cards;

      // Validate arrays
      if (!Array.isArray(currentCards) || !Array.isArray(prevCards)) {
        console.error(
          '[ObjectsHandler] Invalid _cards arrays in shuffle detection',
          {
            errorId: SHUFFLE_DETECT_INVALID_ARRAY,
            objectId: id,
            currentType: typeof currentCards,
            prevType: typeof prevCards,
          },
        );
      } else {
        // Check if cards were shuffled (same set, different order)
        isShuffle =
          currentCards.length === prevCards.length &&
          currentCards.length >= 2 &&
          currentCards.every((card) => prevCards.includes(card)) &&
          currentCards.some((card, idx) => card !== prevCards[idx]);
      }
    } catch (error) {
      console.error('[ObjectsHandler] Shuffle detection failed', {
        errorId: SHUFFLE_DETECT_FAILED,
        objectId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (faceUpChanged) {
    // Animate flip: compress → update visual → expand
    const flipOnMidpoint = () => {
      try {
        // At midpoint (scaleX = 0), update the visual
        context.visual.updateVisualForObjectChange(id, context.sceneManager, {
          isHovered,
          isDragging,
          isSelected,
          preservePosition: isDragging, // Preserve position during drag to avoid flashing
          preserveScale: true, // Preserve scale during flip animation
        });
      } catch (error) {
        console.error('[ObjectsHandler] Flip midpoint callback failed', {
          errorId: FLIP_MIDPOINT_FAILED,
          objectId: id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };

    const flipOnComplete = () => {
      try {
        // After flip completes, do a final redraw to ensure correct state
        context.visual.updateVisualForObjectChange(id, context.sceneManager, {
          isHovered,
          isDragging,
          isSelected,
          preservePosition: isDragging,
          // No need to preserve scale after animation completes
        });
      } catch (error) {
        console.error('[ObjectsHandler] Flip complete callback failed', {
          errorId: FLIP_COMPLETE_FAILED,
          objectId: id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };

    context.animation.animateFlip(id, flipOnMidpoint, 150, flipOnComplete);
  } else if (isShuffle) {
    // Start shuffle animation WITHOUT updating visual first
    // The animation will manage the visual entirely
    context.animation.animateShuffle(id, undefined, () => {
      try {
        // After shuffle completes, update visual to show new card order
        context.visual.updateVisualForObjectChange(id, context.sceneManager, {
          isHovered,
          isDragging,
          isSelected,
          preservePosition: isDragging,
        });
      } catch (error) {
        console.error('[ObjectsHandler] Shuffle complete callback failed', {
          errorId: SHUFFLE_COMPLETE_FAILED,
          objectId: id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });
  } else {
    // Skip visual update during shuffle animation to avoid destroying ghost rectangles
    const isShuffling = context.animation.isShuffling(id);
    if (isShuffling) {
      return;
    }

    // No flip or shuffle - just update visual immediately
    context.visual.updateVisualForObjectChange(id, context.sceneManager, {
      isHovered,
      isDragging,
      isSelected,
      preservePosition: isDragging, // Preserve position during drag to avoid flashing
      // No need to set preserveScale - defaults to false for normal scale
    });
  }

  // Animate rotation changes for smooth exhaust/ready
  const currentRotation = visual.rotation; // Current rotation in radians
  const targetRotation = (obj._pos.r * Math.PI) / 180; // Target rotation in radians

  // Calculate shortest angular distance (handles wrapping around 0°/360°)
  let rotationDiff = targetRotation - currentRotation;
  // Normalize to [-π, π] range for shortest path
  while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
  while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
  const finalRotation = currentRotation + rotationDiff;

  // Only animate if rotation changed significantly (more than 0.01 radians ~ 0.57 degrees)
  if (Math.abs(rotationDiff) > 0.01) {
    context.animation.animate({
      visualId: id,
      type: 'rotation',
      from: currentRotation,
      to: finalRotation, // Use calculated shortest path
      duration: 200, // 200ms for snappy card-game feel
      easing: Easing.easeOut, // Smooth deceleration
    });
  } else {
    // Small or no change - set directly
    visual.rotation = targetRotation;
  }
}

/**
 * Helper: Create scaleStrokeWidth function for RenderContext
 *
 * Creates a closure that counter-scales stroke widths using sqrt(cameraScale)
 * for visual consistency across zoom levels.
 */
export function createScaleStrokeWidth(
  cameraScale: number,
  context: string = 'RenderContext',
): (baseWidth: number) => number {
  return (baseWidth: number) => {
    // Validate inputs
    if (!Number.isFinite(baseWidth) || baseWidth < 0) {
      console.error(`[${context}] Invalid baseWidth in scaleStrokeWidth:`, {
        baseWidth,
        cameraScale,
      });
      return 0.5;
    }
    if (!Number.isFinite(cameraScale) || cameraScale <= 0) {
      console.error(`[${context}] Invalid cameraScale in scaleStrokeWidth:`, {
        baseWidth,
        cameraScale,
      });
      return baseWidth;
    }
    // Counter-scale using sqrt for perceptual consistency
    const zoomFactor = Math.max(1, Math.sqrt(cameraScale));
    return Math.max(0.5, baseWidth / zoomFactor);
  };
}
