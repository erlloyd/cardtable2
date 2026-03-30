import type { PointerEventData, StackObject } from '@cardtable2/shared';
import { ObjectKind, DRAG_SENTINEL_KEY } from '@cardtable2/shared';
import type { Container } from 'pixi.js';
import type { SceneManager } from '../SceneManager';
import type { SelectionManager } from './SelectionManager';

/**
 * Drag state for multi-object dragging.
 */
interface DragState {
  draggedObjectId: string;
  dragStartWorldX: number;
  dragStartWorldY: number;
  draggedObjectsStartPositions: Map<string, { x: number; y: number }>;
  currentDragGestureId: string | null;
}

/**
 * DragManager - Handles object dragging logic.
 *
 * Manages:
 * - Single object dragging
 * - Multi-object dragging (all selected objects move together)
 * - Drag start detection (after exceeding slop threshold)
 * - Z-order management (dragged objects move to top)
 * - Spatial index updates (deferred until drag ends for performance)
 * - Drag awareness for multiplayer (gesture IDs)
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class DragManager {
  private isObjectDragging = false;
  private isPhantomDragging = false;
  private dragState: DragState | null = null;
  private pointerDownEvent: PointerEventData | null = null;
  private isUnstackDrag = false; // Track if this is an unstack operation
  private waitingForUnstackSource: string | null = null; // Source stack ID when waiting for unstack response
  private unstackTimeoutId: NodeJS.Timeout | null = null; // Timeout for unstack operations

  /**
   * Store pointer down event for selection logic on pointer up.
   */
  setPointerDownEvent(event: PointerEventData): void {
    this.pointerDownEvent = event;
  }

  /**
   * Get stored pointer down event.
   */
  getPointerDownEvent(): PointerEventData | null {
    return this.pointerDownEvent;
  }

  /**
   * Clear stored pointer down event.
   */
  clearPointerDownEvent(): void {
    this.pointerDownEvent = null;
  }

  /**
   * Check if currently dragging an object.
   */
  isDragging(): boolean {
    return this.isObjectDragging || this.isPhantomDragging;
  }

  setPhantomDragActive(active: boolean): void {
    this.isPhantomDragging = active;
  }

  /**
   * Get the currently dragged object ID.
   */
  getDraggedObjectId(): string | null {
    return this.dragState?.draggedObjectId || null;
  }

  /**
   * Get the current drag gesture ID (for multiplayer awareness).
   */
  getDragGestureId(): string | null {
    return this.dragState?.currentDragGestureId || null;
  }

  /**
   * Get all dragged object IDs (primary + secondaries).
   */
  getDraggedObjectIds(): string[] {
    if (!this.dragState) return [];
    return Array.from(this.dragState.draggedObjectsStartPositions.keys());
  }

  /**
   * Prepare for potential object drag (pointer down on object).
   */
  prepareObjectDrag(objectId: string, worldX: number, worldY: number): void {
    this.dragState = {
      draggedObjectId: objectId,
      dragStartWorldX: worldX,
      dragStartWorldY: worldY,
      draggedObjectsStartPositions: new Map(),
      currentDragGestureId: null,
    };
    this.isObjectDragging = false;
    this.isUnstackDrag = false;
  }

  /**
   * Prepare for potential unstack drag (pointer down on unstack handle).
   */
  prepareUnstackDrag(stackId: string, worldX: number, worldY: number): void {
    this.dragState = {
      draggedObjectId: stackId,
      dragStartWorldX: worldX,
      dragStartWorldY: worldY,
      draggedObjectsStartPositions: new Map(),
      currentDragGestureId: null,
    };
    this.isObjectDragging = false;
    this.isUnstackDrag = true;
  }

  /**
   * Check if this is an unstack drag operation.
   */
  isUnstackDragActive(): boolean {
    return this.isUnstackDrag;
  }

  /**
   * Mark that we're waiting for a new stack to be created from an unstack operation.
   * Sets a 2-second timeout to prevent indefinite waiting.
   * @param sourceStackId - The ID of the source stack that was unstacked
   * @param onTimeout - Callback to invoke if the timeout expires
   */
  setWaitingForUnstackResponse(
    sourceStackId: string,
    onTimeout: () => void,
  ): void {
    this.waitingForUnstackSource = sourceStackId;

    // Clear any existing timeout
    if (this.unstackTimeoutId !== null) {
      clearTimeout(this.unstackTimeoutId);
    }

    // Set a 2-second timeout for the unstack operation
    this.unstackTimeoutId = setTimeout(() => {
      if (this.waitingForUnstackSource === sourceStackId) {
        console.error('[DragManager] Unstack operation timed out', {
          stackId: sourceStackId,
          timeoutMs: 2000,
        });
        this.clearUnstackWaiting();
        onTimeout();
      }
    }, 2000);
  }

  /**
   * Check if we're waiting for an unstack response and if this is the source stack.
   * @param stackId - Stack ID to check
   * @returns True if we're waiting for an unstack from this source
   */
  isWaitingForUnstackFrom(stackId: string): boolean {
    return this.waitingForUnstackSource === stackId;
  }

  /**
   * Get the source stack ID we're waiting for unstack from (if any).
   */
  getUnstackSourceId(): string | null {
    return this.waitingForUnstackSource;
  }

  /**
   * Clear waiting-for-unstack state and cancel any pending timeout.
   */
  clearUnstackWaiting(): void {
    this.waitingForUnstackSource = null;

    // Clear the timeout if it exists
    if (this.unstackTimeoutId !== null) {
      clearTimeout(this.unstackTimeoutId);
      this.unstackTimeoutId = null;
    }
  }

  /**
   * Start object dragging (after exceeding slop threshold).
   * Determines which objects to drag based on selection state.
   *
   * @returns Array of object IDs that will be dragged
   */
  startObjectDrag(
    sceneManager: SceneManager,
    selectionManager: SelectionManager,
  ): string[] {
    if (!this.dragState) return [];

    this.isObjectDragging = true;

    // Generate unique gesture ID for drag awareness (M5-T1)
    this.dragState.currentDragGestureId = `drag-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Determine which objects to drag
    const objectsToDrag = new Set<string>();
    const isDraggedObjectSelected = selectionManager.isSelected(
      this.dragState.draggedObjectId,
    );
    const isMultiSelectModifier =
      this.pointerDownEvent &&
      (this.pointerDownEvent.metaKey || this.pointerDownEvent.ctrlKey);

    if (isDraggedObjectSelected) {
      // Dragging a selected object - drag all selected objects
      for (const id of selectionManager.getSelectedIds()) {
        objectsToDrag.add(id);
      }
    } else {
      // Dragging an unselected object
      if (isMultiSelectModifier) {
        // With modifier: add to selection and drag all
        for (const id of selectionManager.getSelectedIds()) {
          objectsToDrag.add(id);
        }
        objectsToDrag.add(this.dragState.draggedObjectId);
      } else {
        // Without modifier: drag only this object
        objectsToDrag.add(this.dragState.draggedObjectId);
      }
    }

    // Include attached cards as secondaries when dragging a parent
    // This ensures attached cards move with their parent during drag
    const attachedToInclude: string[] = [];
    for (const objectId of objectsToDrag) {
      const obj = sceneManager.getObject(objectId);
      if (obj && obj._kind === ObjectKind.Stack) {
        const stackObj = obj as StackObject;
        if (stackObj._attachedCardIds && stackObj._attachedCardIds.length > 0) {
          for (const attachedId of stackObj._attachedCardIds) {
            if (!objectsToDrag.has(attachedId)) {
              attachedToInclude.push(attachedId);
            }
          }
        }
      }
    }
    for (const id of attachedToInclude) {
      objectsToDrag.add(id);
    }

    // Save initial positions of all objects to drag
    this.dragState.draggedObjectsStartPositions.clear();
    for (const objectId of objectsToDrag) {
      const obj = sceneManager.getObject(objectId);
      if (obj) {
        this.dragState.draggedObjectsStartPositions.set(objectId, {
          x: obj._pos.x,
          y: obj._pos.y,
        });
      }
    }

    // Update z-order for all dragged objects
    this.updateDraggedObjectsZOrder(sceneManager, objectsToDrag);

    // Remove dragged objects from spatial index so stale bboxes don't block
    // hit-tests on objects underneath. Re-added in endObjectDrag via updateObject().
    sceneManager.removeSpatialEntries(objectsToDrag);

    return Array.from(objectsToDrag);
  }

  /**
   * Update positions of all dragged objects.
   */
  updateDragPositions(
    worldX: number,
    worldY: number,
    sceneManager: SceneManager,
    objectVisuals: Map<string, Container>,
  ): void {
    if (!this.dragState || !this.isObjectDragging) return;

    // Calculate drag delta from the primary dragged object's start position
    const deltaX = worldX - this.dragState.dragStartWorldX;
    const deltaY = worldY - this.dragState.dragStartWorldY;

    // Update all dragged objects' positions based on delta
    for (const objectId of this.dragState.draggedObjectsStartPositions.keys()) {
      const startPos =
        this.dragState.draggedObjectsStartPositions.get(objectId);
      const obj = sceneManager.getObject(objectId);

      if (startPos && obj) {
        // Update object position in memory (relative to start position)
        obj._pos.x = startPos.x + deltaX;
        obj._pos.y = startPos.y + deltaY;

        // Update visual position immediately for smooth rendering
        const visual = objectVisuals.get(objectId);
        if (visual) {
          visual.x = obj._pos.x;
          visual.y = obj._pos.y;
        }
      }
    }
  }

  /**
   * Get drag state update for multiplayer awareness.
   */
  getDragStateUpdate(sceneManager: SceneManager): {
    gid: string;
    primaryId: string;
    pos: { x: number; y: number; r: number };
    secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>;
  } | null {
    if (
      !this.dragState ||
      !this.isObjectDragging ||
      !this.dragState.currentDragGestureId
    ) {
      return null;
    }

    const primaryObj = sceneManager.getObject(this.dragState.draggedObjectId);
    if (!primaryObj) return null;

    // Calculate relative offsets for secondary objects (if dragging multiple)
    const secondaryOffsets: Record<
      string,
      { dx: number; dy: number; dr: number }
    > = {};
    let hasSecondary = false;

    for (const [id] of this.dragState.draggedObjectsStartPositions) {
      if (id !== this.dragState.draggedObjectId) {
        const secondaryObj = sceneManager.getObject(id);
        if (secondaryObj) {
          secondaryOffsets[id] = {
            dx: secondaryObj._pos.x - primaryObj._pos.x,
            dy: secondaryObj._pos.y - primaryObj._pos.y,
            dr: secondaryObj._pos.r - primaryObj._pos.r,
          };
          hasSecondary = true;
        }
      }
    }

    return {
      gid: this.dragState.currentDragGestureId,
      primaryId: this.dragState.draggedObjectId,
      pos: {
        x: primaryObj._pos.x,
        y: primaryObj._pos.y,
        r: primaryObj._pos.r,
      },
      secondaryOffsets: hasSecondary ? secondaryOffsets : undefined,
    };
  }

  /**
   * End object dragging and finalize positions.
   * @returns Position updates for all dragged objects
   */
  endObjectDrag(
    sceneManager: SceneManager,
  ): Array<{ id: string; pos: { x: number; y: number; r: number } }> {
    if (!this.dragState || !this.isObjectDragging) return [];

    const positionUpdates: Array<{
      id: string;
      pos: { x: number; y: number; r: number };
    }> = [];

    // Update SceneManager spatial index for all dragged cards now that drag is complete
    // (deferred from pointer move for performance)
    for (const objectId of this.dragState.draggedObjectsStartPositions.keys()) {
      const obj = sceneManager.getObject(objectId);
      if (obj) {
        sceneManager.updateObject(objectId, obj);
        positionUpdates.push({ id: objectId, pos: obj._pos });
      }
    }

    // Clear drag state
    this.isObjectDragging = false;
    this.dragState = null;

    return positionUpdates;
  }

  /**
   * Cancel object dragging without sending updates.
   */
  cancelObjectDrag(): void {
    this.isObjectDragging = false;
    this.isPhantomDragging = false;
    this.dragState = null;
    this.isUnstackDrag = false;
    this.clearUnstackWaiting();
  }

  /**
   * Update z-order for all dragged objects (move to top).
   */
  private updateDraggedObjectsZOrder(
    _sceneManager: SceneManager,
    objectsToDrag: Set<string>,
  ): void {
    // Use DRAG_SENTINEL_KEY as base key — guaranteed above all normal objects.
    // moveObjects assigns proper keys on drag end, so this is temporary.
    const dragBaseKey = DRAG_SENTINEL_KEY;

    for (const objectId of objectsToDrag) {
      const obj = _sceneManager.getObject(objectId);
      if (!obj) continue;

      // Preserve attachment sub-key structure: replace the base prefix, keep sub-keys
      const segments = obj._sortKey.split('|');
      if (segments.length > 1) {
        obj._sortKey = [dragBaseKey, ...segments.slice(1)].join('|');
      } else {
        obj._sortKey = dragBaseKey;
      }
    }
  }

  /**
   * Clear drag preparation state (pointer down, slop tracking).
   *
   * Does NOT clear waitingForUnstackSource — that state must survive
   * between the unstack request and the async objects-added response.
   * Use cancelObjectDrag() to fully abort including unstack waiting.
   */
  clear(): void {
    this.isObjectDragging = false;
    this.isPhantomDragging = false;
    this.dragState = null;
    this.pointerDownEvent = null;
    this.isUnstackDrag = false;
  }
}
