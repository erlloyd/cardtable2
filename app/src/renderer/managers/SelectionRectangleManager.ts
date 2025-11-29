import { Graphics, Container } from 'pixi.js';

/**
 * SelectionRectangleManager - Manages rectangle selection state and visuals.
 *
 * Handles:
 * - Rectangle selection mode detection
 * - Selection rectangle graphic rendering
 * - Hit-testing for objects within rectangle bounds
 *
 * Rectangle selection is triggered by:
 * - Select mode + no modifier (draw rectangle)
 * - Pan mode + modifier (draw rectangle)
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class SelectionRectangleManager {
  private isRectangleSelecting = false;
  private rectangleSelectStartX = 0;
  private rectangleSelectStartY = 0;
  private selectionRectangle: Graphics | null = null;

  /**
   * Check if currently rectangle selecting.
   */
  isSelecting(): boolean {
    return this.isRectangleSelecting;
  }

  /**
   * Get rectangle start position.
   */
  getStartPosition(): { x: number; y: number } {
    return {
      x: this.rectangleSelectStartX,
      y: this.rectangleSelectStartY,
    };
  }

  /**
   * Check if should start rectangle selection based on mode and modifiers.
   */
  shouldStartRectangleSelect(
    interactionMode: 'pan' | 'select',
    modifierPressed: boolean,
    hitResult: { id: string } | null,
  ): boolean {
    // Only start rectangle select if clicking on empty space (no hit result)
    if (hitResult) return false;

    // Rectangle select mode:
    // - Select mode without modifier
    // - Pan mode with modifier
    return (
      (interactionMode === 'select' && !modifierPressed) ||
      (interactionMode === 'pan' && modifierPressed)
    );
  }

  /**
   * Prepare for potential rectangle selection (pointer down on empty space).
   */
  prepareRectangleSelect(worldX: number, worldY: number): void {
    this.rectangleSelectStartX = worldX;
    this.rectangleSelectStartY = worldY;
    this.isRectangleSelecting = false; // Will become true after exceeding slop
  }

  /**
   * Start rectangle selection (after exceeding slop threshold).
   */
  startRectangleSelect(): void {
    this.isRectangleSelecting = true;
    console.log('[SelectionRectangleManager] Starting rectangle selection');
  }

  /**
   * Update or create selection rectangle graphic.
   */
  updateRectangle(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    worldContainer: Container,
  ): void {
    // Create selection rectangle if it doesn't exist
    if (!this.selectionRectangle) {
      this.selectionRectangle = new Graphics();
      worldContainer.addChild(this.selectionRectangle);
    }

    // Clear and redraw rectangle
    this.selectionRectangle.clear();

    // Calculate rectangle bounds
    const minX = Math.min(startX, endX);
    const minY = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    // Draw filled rectangle with border
    this.selectionRectangle.rect(minX, minY, width, height);
    this.selectionRectangle.fill({ color: 0x3b82f6, alpha: 0.2 }); // Blue fill
    this.selectionRectangle.stroke({ width: 2, color: 0x3b82f6 }); // Blue border
  }

  /**
   * Get rectangle bounds for hit-testing.
   */
  getRectangleBounds(
    endX: number,
    endY: number,
  ): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    return {
      minX: Math.min(this.rectangleSelectStartX, endX),
      minY: Math.min(this.rectangleSelectStartY, endY),
      maxX: Math.max(this.rectangleSelectStartX, endX),
      maxY: Math.max(this.rectangleSelectStartY, endY),
    };
  }

  /**
   * Clear selection rectangle graphic.
   */
  clearRectangle(worldContainer: Container): void {
    if (this.selectionRectangle) {
      worldContainer.removeChild(this.selectionRectangle);
      this.selectionRectangle.destroy();
      this.selectionRectangle = null;
    }
  }

  /**
   * End rectangle selection and reset state.
   */
  endRectangleSelect(): void {
    this.isRectangleSelecting = false;
    this.rectangleSelectStartX = 0;
    this.rectangleSelectStartY = 0;
  }

  /**
   * Cancel rectangle selection without selecting objects.
   */
  cancel(worldContainer: Container): void {
    this.clearRectangle(worldContainer);
    this.endRectangleSelect();
  }

  /**
   * Clear all state.
   */
  clear(worldContainer: Container | null): void {
    if (worldContainer) {
      this.clearRectangle(worldContainer);
    }
    this.isRectangleSelecting = false;
    this.rectangleSelectStartX = 0;
    this.rectangleSelectStartY = 0;
  }
}
