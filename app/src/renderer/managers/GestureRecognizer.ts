import type { PointerEventData } from '@cardtable2/shared';

/**
 * Drag slop thresholds by pointer type (M2-T3).
 * Movement must exceed these thresholds to start a drag/pan gesture.
 */
const DRAG_SLOP = {
  touch: 12,
  pen: 6,
  mouse: 3,
} as const;

/**
 * Pointer tracking info.
 */
interface PointerInfo {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  type: string;
}

/**
 * GestureRecognizer - Interprets pointer events into gestures.
 *
 * Tracks pointer state and determines gesture intent:
 * - Single pointer: pan, drag, tap, or rectangle select
 * - Two pointers: pinch zoom
 * - Drag slop: requires minimum movement before starting gestures
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class GestureRecognizer {
  private pointers: Map<number, PointerInfo> = new Map();

  /**
   * Track a pointer down event.
   */
  addPointer(event: PointerEventData): void {
    this.pointers.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      type: event.pointerType,
    });
  }

  /**
   * Update a pointer's current position.
   */
  updatePointer(event: PointerEventData): void {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer) {
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
    }
  }

  /**
   * Remove a pointer (pointer up/cancel).
   */
  removePointer(pointerId: number): void {
    this.pointers.delete(pointerId);
  }

  /**
   * Get a specific pointer's info.
   */
  getPointer(pointerId: number): PointerInfo | undefined {
    return this.pointers.get(pointerId);
  }

  /**
   * Get all active pointers.
   */
  getAllPointers(): PointerInfo[] {
    return Array.from(this.pointers.values());
  }

  /**
   * Get the number of active pointers.
   */
  getPointerCount(): number {
    return this.pointers.size;
  }

  /**
   * Check if we have exactly 2 touch pointers (pinch gesture).
   */
  isPinchGesture(event: PointerEventData): boolean {
    return this.pointers.size === 2 && event.pointerType === 'touch';
  }

  /**
   * Calculate distance between two pointers (for pinch zoom).
   */
  getPointerDistance(p1: PointerInfo, p2: PointerInfo): number {
    const dx = p2.lastX - p1.lastX;
    const dy = p2.lastY - p1.lastY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if pointer movement exceeds drag slop threshold.
   * @param pointerId - The pointer to check
   * @returns True if movement exceeds slop threshold
   */
  exceedsDragSlop(pointerId: number): boolean {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return false;

    const dx = pointer.lastX - pointer.startX;
    const dy = pointer.lastY - pointer.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Get slop threshold for pointer type
    const slopThreshold =
      pointer.type === 'mouse' ||
      pointer.type === 'pen' ||
      pointer.type === 'touch'
        ? DRAG_SLOP[pointer.type]
        : DRAG_SLOP.mouse;

    return distance > slopThreshold;
  }

  /**
   * Reset a pointer's start position to current position.
   * Useful for transitioning from pinch to pan without requiring slop again.
   */
  resetPointerStart(pointerId: number): void {
    const pointer = this.pointers.get(pointerId);
    if (pointer) {
      pointer.startX = pointer.lastX;
      pointer.startY = pointer.lastY;
    }
  }

  /**
   * Clear all pointers.
   */
  clear(): void {
    this.pointers.clear();
  }
}
