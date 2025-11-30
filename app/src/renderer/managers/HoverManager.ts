/**
 * HoverManager - Manages object hover state and effects.
 *
 * Tracks which object is currently hovered and provides
 * state for visual feedback (scale animation, shadows).
 *
 * Hover only applies to mouse and pen pointers, not touch.
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class HoverManager {
  private hoveredObjectId: string | null = null;

  /**
   * Get the currently hovered object ID.
   */
  getHoveredObjectId(): string | null {
    return this.hoveredObjectId;
  }

  /**
   * Check if a specific object is hovered.
   */
  isHovered(objectId: string): boolean {
    return this.hoveredObjectId === objectId;
  }

  /**
   * Set the hovered object.
   * @returns True if hover state changed
   */
  setHoveredObject(objectId: string | null): boolean {
    if (this.hoveredObjectId === objectId) {
      return false;
    }

    this.hoveredObjectId = objectId;
    return true;
  }

  /**
   * Clear hover for a specific object (when it's removed or drag starts).
   */
  clearHover(objectId: string): void {
    if (this.hoveredObjectId === objectId) {
      this.hoveredObjectId = null;
    }
  }

  /**
   * Clear all hover state.
   */
  clearAll(): void {
    this.hoveredObjectId = null;
  }

  /**
   * Check if hover should be active given current interaction state.
   * Hover is only active for mouse/pen (not touch) and when not dragging.
   */
  shouldProcessHover(
    pointerType: string,
    isDragging: boolean,
    isPinching: boolean,
    isObjectDragging: boolean,
    isRectangleSelecting: boolean,
  ): boolean {
    return (
      (pointerType === 'mouse' || pointerType === 'pen') &&
      !isDragging &&
      !isPinching &&
      !isObjectDragging &&
      !isRectangleSelecting
    );
  }
}
