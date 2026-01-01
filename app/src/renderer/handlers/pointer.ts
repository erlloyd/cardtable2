/**
 * Pointer event handlers
 *
 * Handles all pointer events: down, move, up, cancel, leave.
 * Includes gesture recognition, object dragging, selection, and hover feedback.
 */

import type {
  MainToRendererMessage,
  PointerEventData,
  TableObject,
} from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { snapMultipleToGrid } from '../../utils/gridSnap';
import { getBehaviors } from '../objects';
import {
  STACK_WIDTH,
  STACK_HEIGHT,
  STACK_BADGE_SIZE,
} from '../objects/stack/constants';
import { getCardCount } from '../objects/stack/utils';

/**
 * Helper: Check if a world position is within the unstack handle region of a stack
 *
 * Returns true if the stack has 2+ cards and the position is within the unstack handle bounds.
 */
function isPointInUnstackHandle(
  worldX: number,
  worldY: number,
  obj: TableObject,
): boolean {
  // Only stacks with 2+ cards have unstack handles
  const cardCount = getCardCount(obj);
  if (cardCount < 2) return false;

  // Calculate world-relative coordinates
  const worldRelX = worldX - obj._pos.x;
  const worldRelY = worldY - obj._pos.y;

  // Transform to object's local coordinate space (apply inverse rotation)
  const angleRad = (obj._pos.r * Math.PI) / 180;
  const cos = Math.cos(-angleRad); // Negative angle for inverse rotation
  const sin = Math.sin(-angleRad);
  const localX = worldRelX * cos - worldRelY * sin;
  const localY = worldRelX * sin + worldRelY * cos;

  // Unstack handle position in local space (upper-right corner, from behaviors.ts)
  const handleX = STACK_WIDTH / 2 - STACK_BADGE_SIZE / 2; // Right edge
  const handleY = -STACK_HEIGHT / 2 + STACK_BADGE_SIZE / 2; // Top edge

  // Check if point is within handle bounds in local space
  const minX = handleX - STACK_BADGE_SIZE / 2;
  const maxX = handleX + STACK_BADGE_SIZE / 2;
  const minY = handleY - STACK_BADGE_SIZE / 2;
  const maxY = handleY + STACK_BADGE_SIZE / 2;

  return localX >= minX && localX <= maxX && localY >= minY && localY <= maxY;
}

/**
 * Handle pointer down event
 *
 * Initializes gesture recognition and prepares for dragging/selection/panning.
 * Handles pinch-to-zoom detection and object hit-testing.
 */
export function handlePointerDown(
  message: Extract<MainToRendererMessage, { type: 'pointer-down' }>,
  context: RendererContext,
): void {
  const event = message.event;

  // Track pointer start position for gesture recognition
  context.gestures.addPointer(event);

  // Check if we have 2 touch pointers (pinch gesture)
  if (context.gestures.isPinchGesture(event)) {
    // Cancel any ongoing drag operations
    context.drag.cancelObjectDrag();
    context.rectangleSelect.clear(context.worldContainer);

    // M3.5.1-T6: Notify Board that zoom started (pinch)
    context.postResponse({ type: 'zoom-started' });

    // Start pinch zoom (delegates all pinch state to CameraManager)
    const pointers = Array.from(context.gestures.getAllPointers().values());
    context.camera.startPinch(pointers);
  } else if (event.isPrimary) {
    // E2E Test API: Increment pending operations counter
    // This will be decremented after the full round-trip completes (syncSelectionCache)
    context.selection.incrementPendingOperations();

    // Store pointer down event for selection logic on pointer up
    context.drag.setPointerDownEvent(event);

    // Always do hit-testing first to determine if we're over a card
    const worldPos = context.coordConverter.screenToWorld(
      event.clientX,
      event.clientY,
      context.worldContainer,
    );

    const hitResult = context.sceneManager.hitTest(worldPos.x, worldPos.y);

    // Determine if we're in rectangle-select mode based on interaction mode + modifiers
    // Note: multiSelectModeActive should NOT trigger rectangle selection
    const modifierPressed = event.metaKey || event.ctrlKey;
    const shouldRectangleSelect =
      (context.interactionMode === 'select' && !modifierPressed) ||
      (context.interactionMode === 'pan' && modifierPressed);

    if (hitResult) {
      // Check if clicking on unstack handle (upper-right corner of stack with 2+ cards)
      // Only active when 0-1 stacks selected (not during multi-select)
      const selectedCount = context.selection.getSelectedCount();
      const isUnstackHandleClick =
        selectedCount <= 1 &&
        isPointInUnstackHandle(worldPos.x, worldPos.y, hitResult.object);

      if (isUnstackHandleClick) {
        // Clicking on unstack handle - prepare for unstack drag
        context.drag.prepareUnstackDrag(hitResult.id, worldPos.x, worldPos.y);
      } else {
        // Clicking on a card - always prepare for object drag (regardless of mode)
        context.drag.prepareObjectDrag(hitResult.id, worldPos.x, worldPos.y);
      }
      context.rectangleSelect.clear(context.worldContainer);
    } else if (shouldRectangleSelect) {
      // Clicking on empty space in rectangle select mode - prepare for rectangle selection
      // Note: Not starting yet - will start once we exceed slop threshold in handlePointerMove
      context.rectangleSelect.clear(context.worldContainer); // Reset any previous state
      context.rectangleSelect.prepareRectangleSelect(worldPos.x, worldPos.y); // Save start position
      context.drag.cancelObjectDrag();
    } else {
      // Clicking on empty space in pan mode - prepare for camera pan
      context.drag.cancelObjectDrag();
      context.rectangleSelect.clear(context.worldContainer);
    }
  }
}

/**
 * Handle pointer move event
 *
 * Handles pinch-to-zoom, object dragging, camera panning, rectangle selection,
 * and hover feedback.
 */
export function handlePointerMove(
  message: Extract<MainToRendererMessage, { type: 'pointer-move' }>,
  context: RendererContext,
): void {
  const event = message.event;
  const pointerInfo = context.gestures.getPointer(event.pointerId);

  // Only handle gestures if pointer is being tracked (after pointer-down)
  if (pointerInfo) {
    // Save previous pointer position BEFORE updating (for delta calculation)
    const prevX = pointerInfo.lastX;
    const prevY = pointerInfo.lastY;

    // Update pointer position in gesture recognizer
    context.gestures.updatePointer(event);

    // Handle pinch zoom (2 fingers)
    if (context.camera.isPinchingActive()) {
      const pointers = Array.from(context.gestures.getAllPointers().values());
      if (pointers.length === 2) {
        // Calculate distances
        const initialDistance = Math.hypot(
          pointers[1].startX - pointers[0].startX,
          pointers[1].startY - pointers[0].startY,
        );
        const currentDistance = Math.hypot(
          pointers[1].lastX - pointers[0].lastX,
          pointers[1].lastY - pointers[0].lastY,
        );
        context.camera.updatePinch(initialDistance, currentDistance);
      }

      // Check if we're currently pinching to update scales
      // Update coordinate converter with new scale
      context.coordConverter.setCameraScale(context.worldContainer.scale.x);
      context.visual.setCameraScale(context.worldContainer.scale.x);

      // Request render
      context.app.renderer.render(context.app.stage);
      // Don't return - we still want to do hit-test for hover
    }

    // Handle single-pointer pan/drag (M2-T3 + M2-T5 object dragging)
    if (context.gestures.getPointerCount() === 1) {
      const exceedsDragSlop = context.gestures.exceedsDragSlop(event.pointerId);
      const isDragging = context.drag.isDragging();
      const isRectangleSelecting = context.rectangleSelect.isSelecting();

      // Check if movement exceeds drag slop threshold
      // Only start a NEW gesture if we're not already in one
      if (
        exceedsDragSlop &&
        !isDragging &&
        !isRectangleSelecting &&
        !context.camera.isPanningActive() &&
        event.isPrimary
      ) {
        // Determine what to start based on what was prepared in handlePointerDown
        const draggedId = context.drag.getDraggedObjectId();

        if (draggedId) {
          // Check if this is an unstack drag - if so, create real stack immediately
          if (context.drag.isUnstackDragActive()) {
            // Calculate world position for new stack
            const worldPos = context.coordConverter.screenToWorld(
              event.clientX,
              event.clientY,
              context.worldContainer,
            );

            // CRITICAL: Clear all selections FIRST (before sending unstack-card)
            // This ensures no lingering visual feedback on the source stack or other objects
            const currentlySelected = context.selection.getSelectedIds();
            if (currentlySelected.length > 0) {
              context.postResponse({
                type: 'objects-unselected',
                ids: currentlySelected,
              });
            }

            // Send unstack message immediately - Yjs will create real stack
            context.postResponse({
              type: 'unstack-card',
              stackId: draggedId,
              pos: { x: worldPos.x, y: worldPos.y, r: 0 },
            });

            // Mark that we're waiting for the new stack to arrive (with 2s timeout)
            context.drag.setWaitingForUnstackResponse(draggedId, () => {
              // Timeout callback: notify main thread of failure
              context.postResponse({
                type: 'error',
                error: 'Unstack operation timed out',
                context: 'pointer-unstack',
              });
            });

            // Don't start dragging yet - wait for objects-added
            // Clear the drag preparation so we don't try to drag the source stack
            context.drag.clear();
            return;
          }

          // M3.5.1-T6: Notify Board that object drag started
          context.postResponse({ type: 'object-drag-started' });

          // Start object drag (determines which objects to drag, handles selection, updates z-order)
          const draggedIds = context.drag.startObjectDrag(
            context.sceneManager,
            context.selection,
          );

          // Handle selection updates if needed (async)
          const isDraggedObjectSelected =
            context.selection.isSelected(draggedId);
          const pointerDownEvent = context.drag.getPointerDownEvent();
          const isMultiSelectModifier =
            pointerDownEvent &&
            (pointerDownEvent.metaKey || pointerDownEvent.ctrlKey);

          if (!isDraggedObjectSelected) {
            // Dragging an unselected object - update selection
            if (isMultiSelectModifier) {
              selectObjects(context, [draggedId], false); // Add to selection
            } else {
              selectObjects(context, [draggedId], true); // Replace selection
            }
          }

          // Apply drag visual feedback to all dragged objects
          for (const objectId of draggedIds) {
            const isSelected = context.selection.isSelected(objectId);
            context.visual.updateDragFeedback(
              objectId,
              true,
              isSelected,
              context.sceneManager,
            );

            // Update visual z-order
            const visual = context.visual.getVisual(objectId);
            if (visual) {
              context.worldContainer.setChildIndex(
                visual,
                context.worldContainer.children.length - 1,
              );
            }
          }
        } else {
          // Check if we should start rectangle selection or camera pan
          // Rectangle selection logic (matches handlePointerDown):
          // - select mode + NO modifier → rectangle select
          // - pan mode + modifier → rectangle select
          // - select mode + modifier → pan (Cmd/Ctrl overrides to pan)
          // - pan mode + NO modifier → pan
          const pointerDownEvent = context.drag.getPointerDownEvent();
          const modifierPressed =
            pointerDownEvent &&
            (pointerDownEvent.metaKey || pointerDownEvent.ctrlKey);
          const shouldStartRectangle =
            (context.interactionMode === 'select' && !modifierPressed) ||
            (context.interactionMode === 'pan' && modifierPressed);

          if (shouldStartRectangle) {
            context.rectangleSelect.startRectangleSelect();
          } else {
            // No object and not rectangle selecting - start camera pan
            context.camera.startPan();
            // M3.5.1-T6: Notify Board that pan started
            context.postResponse({ type: 'pan-started' });
          }
        }
      }

      // If dragging an object, update positions of all dragged objects
      if (context.drag.isDragging() && event.isPrimary) {
        // Calculate current world position
        const worldPos = context.coordConverter.screenToWorld(
          event.clientX,
          event.clientY,
          context.worldContainer,
        );

        // Update drag positions (handles all dragged objects)
        context.drag.updateDragPositions(
          worldPos.x,
          worldPos.y,
          context.sceneManager,
          context.visual.getAllVisuals(),
        );

        // Detect stack target for visual feedback
        detectAndShowStackTarget(context, worldPos.x, worldPos.y);

        // Send drag state update for awareness (M5-T1)
        const dragStateUpdate = context.drag.getDragStateUpdate(
          context.sceneManager,
        );
        if (dragStateUpdate) {
          context.postResponse({
            type: 'drag-state-update',
            gid: dragStateUpdate.gid,
            primaryId: dragStateUpdate.primaryId,
            pos: dragStateUpdate.pos,
            secondaryOffsets: dragStateUpdate.secondaryOffsets,
          });
        }

        // Render grid snap ghosts if enabled
        if (context.gridSnapEnabled) {
          const draggedIds = context.drag.getDraggedObjectIds();

          // Gather all dragged objects with their current positions
          const objectsToSnap: Array<{
            id: string;
            pos: { x: number; y: number; r: number };
          }> = [];

          for (const objectId of draggedIds) {
            const obj = context.sceneManager.getObject(objectId);
            if (!obj) {
              console.warn(
                `[pointer] Cannot calculate snap position for object ${objectId}: Object not found. ` +
                  'Drag state may be stale.',
              );
              continue;
            }
            objectsToSnap.push({ id: objectId, pos: obj._pos });
          }

          // Calculate collision-free snapped positions for all objects
          const snappedPositions = snapMultipleToGrid(objectsToSnap, true);

          // Convert to ghost data format
          const ghostData: Array<{
            id: string;
            snappedPos: { x: number; y: number; r: number };
          }> = [];

          snappedPositions.forEach((pos, id) => {
            ghostData.push({
              id,
              snappedPos: pos,
            });
          });

          // Render ghosts
          context.gridSnap.renderSnapGhosts(
            ghostData,
            context.sceneManager,
            context.worldContainer.scale.x,
            context.worldContainer,
            context.visual,
          );
        } else {
          // Clear ghosts if grid snap is disabled
          context.gridSnap.clearGhosts();
        }

        // Request render
        // Note: SceneManager spatial index update is deferred until drag ends
        // to avoid expensive RBush removal/insertion on every pointer move
        context.app.renderer.render(context.app.stage);
      }
      // If panning camera, continue pan
      else if (context.camera.isPanningActive() && event.isPrimary) {
        // Use camera manager to pan (use saved previous position for delta)
        const deltaX = event.clientX - prevX;
        const deltaY = event.clientY - prevY;
        context.camera.pan(deltaX, deltaY);
        // Request render
        context.app.renderer.render(context.app.stage);
      }
      // If rectangle selecting, update the selection rectangle
      else if (context.rectangleSelect.isSelecting() && event.isPrimary) {
        // Calculate current world position
        const worldPos = context.coordConverter.screenToWorld(
          event.clientX,
          event.clientY,
          context.worldContainer,
        );

        // Update selection rectangle
        const startPos = context.rectangleSelect.getStartPosition();
        if (startPos) {
          context.rectangleSelect.updateRectangle(
            startPos.x,
            startPos.y,
            worldPos.x,
            worldPos.y,
            context.worldContainer,
          );
        }

        // Request render
        context.app.renderer.render(context.app.stage);
      }
    }
  }

  // Hit-test for hover feedback (M2-T4)
  // Only for mouse and pen pointers - touch doesn't have hover
  // Also skip if we're actively dragging, pinching, dragging an object, or rectangle selecting
  if (
    context.hover.shouldProcessHover(
      event.pointerType,
      context.drag.isDragging(),
      context.camera.isPinchingActive(),
      context.rectangleSelect.isSelecting(),
      false, // isPanning - we'll check this separately
    )
  ) {
    // Convert screen coordinates to world coordinates
    const worldPos = context.coordConverter.screenToWorld(
      event.clientX,
      event.clientY,
      context.worldContainer,
    );

    // Perform hit-test
    const hitResult = context.sceneManager.hitTest(worldPos.x, worldPos.y);
    const newHoveredId = hitResult ? hitResult.id : null;

    // Check if hovering over unstack handle
    let isOverUnstackHandle = false;
    if (hitResult) {
      const selectedCount = context.selection.getSelectedCount();
      isOverUnstackHandle =
        selectedCount <= 1 &&
        isPointInUnstackHandle(worldPos.x, worldPos.y, hitResult.object);
    }

    // Send cursor style message
    context.postResponse({
      type: 'cursor-style',
      style: isOverUnstackHandle ? 'pointer' : 'default',
    });

    // Update hover state if changed
    const prevId = context.hover.getHoveredObjectId();
    if (context.hover.setHoveredObject(newHoveredId)) {
      // Clear previous hover
      if (prevId) {
        const isSelected = context.selection.isSelected(prevId);
        context.visual.updateVisualFeedback(
          prevId,
          false,
          isSelected,
          context.sceneManager,
        );
      }

      // Set new hover
      const currentId = context.hover.getHoveredObjectId();
      if (currentId) {
        const isSelected = context.selection.isSelected(currentId);
        context.visual.updateVisualFeedback(
          currentId,
          true,
          isSelected,
          context.sceneManager,
        );
      }

      // Request render to show hover feedback
      context.app.renderer.render(context.app.stage);
    }
  } else {
    // Clear hover when not applicable (touch, dragging, or pinching)
    // But don't clear if we're dragging the hovered object (M2-T5)
    const hoveredId = context.hover.getHoveredObjectId();
    const draggedId = context.drag.getDraggedObjectId();
    if (hoveredId && hoveredId !== draggedId) {
      const isSelected = context.selection.isSelected(hoveredId);
      context.visual.updateVisualFeedback(
        hoveredId,
        false,
        isSelected,
        context.sceneManager,
      );
      context.hover.clearHover(hoveredId);
      context.app.renderer.render(context.app.stage);
    }
  }

  // Send cursor position in world coordinates (M3-T4)
  // Skip cursor updates during object drag (drag-state-update already sent)
  // This avoids double awareness updates (cursor + drag = 60Hz instead of 30Hz)
  if (!context.drag.isDragging()) {
    const worldPos = context.coordConverter.screenToWorld(
      event.clientX,
      event.clientY,
      context.worldContainer,
    );

    context.postResponse({
      type: 'cursor-position',
      x: worldPos.x,
      y: worldPos.y,
    });
  }
}

/**
 * Handle pointer up event
 *
 * Completes gestures (pinch, drag, rectangle selection) and handles
 * click selection logic.
 */
export function handlePointerUp(
  message: Extract<MainToRendererMessage, { type: 'pointer-up' }>,
  context: RendererContext,
): void {
  const event = message.event;

  // Store gesture states before we potentially reset them
  const wasRectangleSelecting = context.rectangleSelect.isSelecting();
  const wasPanning = context.camera.isPanningActive();

  // Clear pointer tracking
  context.gestures.removePointer(event.pointerId);

  // If we were pinching and now have less than 2 pointers, end pinch
  if (
    context.camera.isPinchingActive() &&
    context.gestures.getPointerCount() < 2
  ) {
    context.camera.endPinch();
    console.log('[RendererCore] Pinch gesture ended');

    // M3.5.1-T6: Notify Board that zoom ended (debounced)
    context.debouncedZoomEnd();

    // Clear rectangle selection state to prevent ghost selections
    context.rectangleSelect.clear(context.worldContainer);

    // Transition to pan mode: reset remaining pointer's start position
    // so user doesn't need to exceed drag slop again
    if (context.gestures.getPointerCount() === 1) {
      const remainingPointers = Array.from(
        context.gestures.getAllPointers().entries(),
      );
      if (remainingPointers.length > 0) {
        const [pointerId] = remainingPointers[0];
        context.gestures.resetPointerStart(pointerId);
      }
    }
  }

  // Handle rectangle selection completion
  if (context.rectangleSelect.isSelecting() && event.isPrimary) {
    // Calculate current world position
    const worldPos = context.coordConverter.screenToWorld(
      event.clientX,
      event.clientY,
      context.worldContainer,
    );

    // Update rectangle to final position
    const startPos = context.rectangleSelect.getStartPosition();
    if (startPos) {
      context.rectangleSelect.updateRectangle(
        startPos.x,
        startPos.y,
        worldPos.x,
        worldPos.y,
        context.worldContainer,
      );
    }

    // Get selection bounds and hit-test for objects
    const bounds = context.rectangleSelect.getRectangleBounds(
      worldPos.x,
      worldPos.y,
    );
    const hitTestResult = context.sceneManager.hitTestRect(bounds);

    // Extract IDs from hit test results
    const selectedIds = hitTestResult.map((result) => result.id);

    // Complete rectangle selection
    context.rectangleSelect.clearRectangle(context.worldContainer);
    context.rectangleSelect.endRectangleSelect();

    // Determine if multi-select (keep existing selections)
    const pointerDownEvent = context.drag.getPointerDownEvent();
    const isMultiSelectModifier =
      pointerDownEvent?.metaKey ||
      pointerDownEvent?.ctrlKey ||
      pointerDownEvent?.multiSelectModeActive;

    // Select objects in rectangle
    selectObjects(context, selectedIds, !isMultiSelectModifier);

    console.log(
      `[RendererCore] Rectangle selected ${selectedIds.length} objects`,
    );

    // Request render
    context.app.renderer.render(context.app.stage);
  }

  // Handle selection logic
  handleSelectionOnPointerEnd(
    context,
    event,
    wasRectangleSelecting,
    wasPanning,
  );

  // Clear drag state
  clearDragState(context, event);
}

/**
 * Handle pointer cancel event
 *
 * Cleans up gesture state when pointer is cancelled (e.g., by system gesture).
 * Similar to pointer-up but doesn't trigger selection logic.
 */
export function handlePointerCancel(
  message: Extract<MainToRendererMessage, { type: 'pointer-cancel' }>,
  context: RendererContext,
): void {
  const event = message.event;

  // Store gesture states before we potentially reset them
  const wasRectangleSelecting = context.rectangleSelect.isSelecting();
  const wasPanning = context.camera.isPanningActive();

  // Clear pointer tracking
  context.gestures.removePointer(event.pointerId);

  // If we were pinching and now have less than 2 pointers, end pinch
  if (
    context.camera.isPinchingActive() &&
    context.gestures.getPointerCount() < 2
  ) {
    context.camera.endPinch();
    console.log('[RendererCore] Pinch gesture cancelled');

    // M3.5.1-T6: Notify Board that zoom ended (debounced)
    context.debouncedZoomEnd();

    // Clear rectangle selection state
    context.rectangleSelect.clear(context.worldContainer);
  }

  // Handle selection logic (same as pointer-up)
  handleSelectionOnPointerEnd(
    context,
    event,
    wasRectangleSelecting,
    wasPanning,
  );

  // Clear drag state
  clearDragState(context, event);
}

/**
 * Handle pointer leave event
 *
 * Clears hover state when pointer leaves the canvas.
 */
export function handlePointerLeave(
  _message: Extract<MainToRendererMessage, { type: 'pointer-leave' }>,
  context: RendererContext,
): void {
  // M3-T4: Pointer left the canvas
  // Clear hover state
  const hoveredId = context.hover.getHoveredObjectId();
  if (hoveredId) {
    const isSelected = context.selection.isSelected(hoveredId);
    context.visual.updateVisualFeedback(
      hoveredId,
      false,
      isSelected,
      context.sceneManager,
    );
    context.hover.clearHover(hoveredId);
    context.app.renderer.render(context.app.stage);
  }
}

/**
 * Helper: Handle selection logic on pointer end (up or cancel)
 *
 * Determines whether to select/unselect objects based on click vs drag.
 * Only processes clicks (not drags or pans).
 */
function handleSelectionOnPointerEnd(
  context: RendererContext,
  event: PointerEventData,
  wasRectangleSelecting: boolean,
  wasPanning: boolean,
): void {
  // Handle selection on click/tap (only if we didn't drag object or camera or rectangle select)
  const pointerDownEvent = context.drag.getPointerDownEvent();

  if (
    event.isPrimary &&
    !context.drag.isDragging() &&
    !wasPanning &&
    !wasRectangleSelecting &&
    pointerDownEvent
  ) {
    const worldPos = context.coordConverter.screenToWorld(
      event.clientX,
      event.clientY,
      context.worldContainer,
    );
    const worldX = worldPos.x;
    const worldY = worldPos.y;

    const hitResult = context.sceneManager.hitTest(worldX, worldY);

    if (hitResult) {
      // Clicked on an object - handle selection logic
      const isMultiSelectModifier =
        pointerDownEvent.metaKey ||
        pointerDownEvent.ctrlKey ||
        pointerDownEvent.multiSelectModeActive;

      if (isMultiSelectModifier) {
        // Cmd/Ctrl+click or multi-select mode: toggle selection
        if (context.selection.isSelected(hitResult.id)) {
          unselectObjects(context, [hitResult.id]);
        } else {
          selectObjects(context, [hitResult.id], false);
        }
      } else {
        // Single click: select only this card (unless already selected)
        if (!context.selection.isSelected(hitResult.id)) {
          selectObjects(context, [hitResult.id], true);
        } else {
          // M3.5.1-T4: Already selected, send empty message to signal click processed
          // (for context menu timing - ensures waitForSelectionSettled resolves)
          context.postResponse({
            type: 'objects-selected',
            ids: [],
            screenCoords: [],
          });
        }
      }

      // Request render to show selection changes
      context.app.renderer.render(context.app.stage);
    } else {
      // Clicked on empty space - deselect all
      const selectedIds = context.selection.getSelectedIds();
      if (selectedIds.length > 0) {
        unselectObjects(context, selectedIds);

        // Request render to show deselection
        context.app.renderer.render(context.app.stage);
      } else {
        // M3.5.1-T4: Even if nothing was selected, send an empty unselect message
        // to signal that the click event has been processed (for context menu timing)
        context.postResponse({
          type: 'objects-unselected',
          ids: [],
        });
      }
    }

    // Clear stored pointer down event
    context.drag.clearPointerDownEvent();
  }
}

/**
 * Helper: Clear drag state after pointer end (up or cancel)
 *
 * Updates spatial index, sends position updates to store, and clears drag state.
 */
function clearDragState(
  context: RendererContext,
  event: PointerEventData,
): void {
  // End dragging
  if (event.isPrimary) {
    // Clear object drag state (M2-T5)
    if (context.drag.isDragging()) {
      // Apply grid snap to final positions on pointer-up if enabled
      // DESIGN: Snap occurs at drag end rather than during drag for two reasons:
      //   1. Performance: Avoid modifying Yjs store on every pointer-move event
      //   2. UX: Allow free dragging with visual preview, snap only on commit
      // Uses collision-free snapping to ensure each object gets its own grid space
      if (context.gridSnapEnabled) {
        const draggedIds = context.drag.getDraggedObjectIds();

        // Gather all dragged objects with their current positions
        const objectsToSnap: Array<{
          id: string;
          pos: { x: number; y: number; r: number };
        }> = [];

        for (const objectId of draggedIds) {
          const obj = context.sceneManager.getObject(objectId);
          if (!obj) {
            console.warn(
              `[pointer] Cannot snap object ${objectId}: Object not found during drop. ` +
                'This object will not be snapped to grid.',
            );
            continue;
          }
          objectsToSnap.push({ id: objectId, pos: obj._pos });
        }

        // Calculate collision-free snapped positions
        const snappedPositions = snapMultipleToGrid(objectsToSnap, true);

        // Apply snapped positions to objects
        let snappedCount = 0;
        snappedPositions.forEach((pos, id) => {
          const obj = context.sceneManager.getObject(id);
          if (obj) {
            obj._pos.x = pos.x;
            obj._pos.y = pos.y;
            snappedCount++;
          }
        });

        const failedCount = draggedIds.length - snappedCount;
        if (failedCount > 0) {
          console.warn(
            `[pointer] Grid snap completed with failures: ${snappedCount} snapped, ${failedCount} failed`,
          );
        }
      }

      // Clear snap ghosts
      context.gridSnap.clearGhosts();

      // Get dragged object IDs before ending drag
      const draggedIds = context.drag.getDraggedObjectIds();

      // Detect stack target at final drop position
      const worldPos = context.coordConverter.screenToWorld(
        event.clientX,
        event.clientY,
        context.worldContainer,
      );
      const stackTargetId = detectStackTarget(context, worldPos.x, worldPos.y);

      // Clear stack target feedback (pass empty string since we're clearing)
      // Note: When clearing, objectId is not used, but signature requires it
      context.visual.updateStackTargetFeedback(
        '',
        false,
        false,
        context.sceneManager,
      );

      // End drag and get position updates (M3-T2.5)
      const positionUpdates = context.drag.endObjectDrag(context.sceneManager);

      // Clear drag visual feedback for all dragged objects
      for (const objectId of draggedIds) {
        const isSelected = context.selection.isSelected(objectId);
        context.visual.updateDragFeedback(
          objectId,
          false,
          isSelected,
          context.sceneManager,
        );
      }

      // Note: Unstack operation already handled earlier (sent unstack-card on slop exceeded)
      // So we don't need special handling here - just normal drag completion or stack merge
      if (stackTargetId && draggedIds.length > 0) {
        // Stack operation: merge multiple stacks
        console.log(
          `[RendererCore] Stacking ${draggedIds.length} object(s) onto ${stackTargetId}`,
        );
        context.postResponse({
          type: 'stack-objects',
          ids: draggedIds,
          targetId: stackTargetId,
        });
      } else {
        // Normal drag: send position updates to store (M3-T2.5)
        if (positionUpdates.length > 0) {
          context.postResponse({
            type: 'objects-moved',
            updates: positionUpdates,
          });
        }
      }

      // M3.5.1-T6: Notify Board that object drag ended
      context.postResponse({ type: 'object-drag-ended' });

      // M5-T1: Clear drag awareness state for multiplayer
      context.postResponse({ type: 'drag-state-clear' });

      // Request render to update visuals
      context.app.renderer.render(context.app.stage);
    }

    // Clear rectangle selection if active
    if (context.rectangleSelect.isSelecting()) {
      context.rectangleSelect.clearRectangle(context.worldContainer);
      context.rectangleSelect.endRectangleSelect();
      context.app.renderer.render(context.app.stage);
    }

    // M3.5.1-T6: End camera pan if active
    if (context.camera.isPanningActive()) {
      context.camera.endPan();
      context.postResponse({ type: 'pan-ended' });
    }

    // Clear stored pointer down event
    context.drag.clearPointerDownEvent();
  }
}

/**
 * Helper: Select objects and send selection message
 *
 * @param context - Renderer context
 * @param ids - IDs of objects to select
 * @param clearPrevious - Whether to clear previous selection
 */
function selectObjects(
  context: RendererContext,
  ids: string[],
  clearPrevious = false,
): void {
  // Calculate screen coordinates using VisualManager
  const screenCoords = context.visual.calculateScreenCoords(
    ids,
    context.sceneManager,
    context.coordConverter.getDevicePixelRatio(),
  );

  // If clearPrevious, send unselect message for currently selected objects
  if (clearPrevious) {
    const prevSelected = context.selection.getSelectedIds();
    if (prevSelected.length > 0) {
      context.postResponse({
        type: 'objects-unselected',
        ids: prevSelected,
      });
    }
  }

  // Send selection message with screen coordinates
  if (ids.length > 0) {
    context.postResponse({
      type: 'objects-selected',
      ids,
      screenCoords,
    });
  }
}

/**
 * Helper: Unselect objects and send unselection message
 *
 * @param context - Renderer context
 * @param ids - IDs of objects to unselect
 */
function unselectObjects(context: RendererContext, ids: string[]): void {
  if (ids.length > 0) {
    context.postResponse({
      type: 'objects-unselected',
      ids,
    });
  }
}

/**
 * Helper: Detect if dragged objects are over a valid stack target
 *
 * Returns the target stack ID if valid, or null otherwise.
 * A valid target must:
 * - Be a stack with canStack capability
 * - Not be one of the dragged objects
 * - All dragged objects must be stacks with canStack capability
 *
 * @param context - Renderer context
 * @param worldX - World X coordinate to test
 * @param worldY - World Y coordinate to test
 * @returns Target stack ID or null
 */
function detectStackTarget(
  context: RendererContext,
  worldX: number,
  worldY: number,
): string | null {
  const draggedIds = context.drag.getDraggedObjectIds();
  if (draggedIds.length === 0) return null;

  // Check if all dragged objects are stacks with canStack capability
  for (const id of draggedIds) {
    const obj = context.sceneManager.getObject(id);
    if (!obj) continue;

    const behaviors = getBehaviors(obj._kind);
    if (!behaviors.capabilities.canStack) {
      return null; // At least one dragged object cannot stack
    }
  }

  // Hit-test at current position to find potential target
  const hitResult = context.sceneManager.hitTest(worldX, worldY);
  if (!hitResult) return null;

  // Target must not be one of the dragged objects
  if (draggedIds.includes(hitResult.id)) return null;

  // Target must be a stack with canStack capability
  const targetObj = context.sceneManager.getObject(hitResult.id);
  if (!targetObj) return null;

  const targetBehaviors = getBehaviors(targetObj._kind);
  if (!targetBehaviors.capabilities.canStack) return null;

  return hitResult.id;
}

/**
 * Helper: Detect and show stack target feedback during drag
 *
 * Updates visual feedback to show which stack (if any) will be the target
 * when the drag ends.
 *
 * @param context - Renderer context
 * @param worldX - World X coordinate
 * @param worldY - World Y coordinate
 */
function detectAndShowStackTarget(
  context: RendererContext,
  worldX: number,
  worldY: number,
): void {
  const targetId = detectStackTarget(context, worldX, worldY);

  // Update stack target feedback
  if (targetId) {
    const isSelected = context.selection.isSelected(targetId);
    context.visual.updateStackTargetFeedback(
      targetId,
      true,
      isSelected,
      context.sceneManager,
    );
  } else {
    // Clear any existing stack target feedback
    context.visual.updateStackTargetFeedback(
      '',
      false,
      false,
      context.sceneManager,
    );
  }
}
