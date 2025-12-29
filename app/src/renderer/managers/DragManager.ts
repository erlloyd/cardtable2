import type { PointerEventData } from '@cardtable2/shared';
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
  private dragState: DragState | null = null;
  private pointerDownEvent: PointerEventData | null = null;
  private isUnstackDrag = false; // Track if this is an unstack operation

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
    return this.isObjectDragging;
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
    this.dragState = null;
    this.isUnstackDrag = false;
  }

  /**
   * Update z-order for all dragged objects (move to top).
   */
  private updateDraggedObjectsZOrder(
    sceneManager: SceneManager,
    objectsToDrag: Set<string>,
  ): void {
    // Find the current maximum sortKey (lexicographic comparison for fractional indexing)
    let maxSortKey = '0';
    for (const [, obj] of sceneManager.getAllObjects()) {
      if (obj._sortKey > maxSortKey) {
        maxSortKey = obj._sortKey;
      }
    }

    // Generate new sortKeys for dragged cards using fractional indexing
    // Increment the prefix to ensure new keys are lexicographically greater
    const [prefix] = maxSortKey.split('|');
    const newPrefix = String(Number(prefix) + 1);

    let sortKeyCounter = 0;
    for (const objectId of objectsToDrag) {
      const obj = sceneManager.getObject(objectId);
      if (obj) {
        // Update logical z-order (_sortKey) using fractional indexing format
        // TODO: Current implementation only supports up to 26 cards in a single drag operation
        // (a-z = 97-122). For production, implement proper fractional indexing library
        // that supports unlimited suffix generation (e.g., 'aa', 'ab', ... 'ba', 'bb').
        // See: https://github.com/rocicorp/fractional-indexing or similar
        obj._sortKey = `${newPrefix}|${String.fromCharCode(97 + sortKeyCounter++)}`;
      }
    }
  }

  /**
   * Clear all drag state.
   */
  clear(): void {
    this.isObjectDragging = false;
    this.dragState = null;
    this.pointerDownEvent = null;
    this.isUnstackDrag = false;
  }
}
