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
/**
 * Sub-region of a Counter pill that the pointer is currently over (ct-d2p).
 * `null` when the pointer is not over a counter or is over the center
 * (value-display) zone — the +/- side zones are the only interactive
 * sub-regions.
 */
export type CounterZone = 'minus' | 'plus' | null;

export class HoverManager {
  private hoveredObjectId: string | null = null;
  private hoveredCounterZone: CounterZone = null;

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
    // Hover left the previous object — its zone state is meaningless now.
    // Counter-specific zone updates happen via setHoveredCounterZone.
    this.hoveredCounterZone = null;
    return true;
  }

  /**
   * Get the currently hovered Counter sub-zone (ct-d2p).
   * Returns `null` whenever the pointer is not over a Counter side-zone.
   */
  getHoveredCounterZone(): CounterZone {
    return this.hoveredCounterZone;
  }

  /**
   * Set the hovered Counter sub-zone (ct-d2p).
   * @returns True if the zone state changed and the visual should redraw.
   */
  setHoveredCounterZone(zone: CounterZone): boolean {
    if (this.hoveredCounterZone === zone) {
      return false;
    }
    this.hoveredCounterZone = zone;
    return true;
  }

  /**
   * Clear hover for a specific object (when it's removed or drag starts).
   */
  clearHover(objectId: string): void {
    if (this.hoveredObjectId === objectId) {
      this.hoveredObjectId = null;
      this.hoveredCounterZone = null;
    }
  }

  /**
   * Clear all hover state.
   */
  clearAll(): void {
    this.hoveredObjectId = null;
    this.hoveredCounterZone = null;
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
