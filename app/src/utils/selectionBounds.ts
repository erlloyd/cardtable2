import type { TableObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';

/**
 * Rectangle representing bounds in screen coordinates
 */
export interface Bounds {
  x: number; // Top-left x
  y: number; // Top-left y
  width: number;
  height: number;
}

/**
 * Position for action handle placement
 */
export interface HandlePosition {
  x: number; // Center x coordinate
  y: number; // Top y coordinate (handle hangs below this point)
  flipToLeft: boolean; // Whether to flip handle to left side
  flipToBottom: boolean; // Whether to flip handle below selection
}

/**
 * Calculate bounding box for a collection of selected objects.
 * Returns bounds in world coordinates.
 */
export function calculateSelectionBounds(objects: TableObject[]): Bounds {
  if (objects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // Stack dimensions (hardcoded for now, matches RendererCore)
  const STACK_WIDTH = 100;
  const STACK_HEIGHT = 140;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    const pos = obj._pos;

    // Calculate object bounds based on type
    let objMinX: number;
    let objMinY: number;
    let objMaxX: number;
    let objMaxY: number;

    if (obj._kind === ObjectKind.Stack) {
      // Stacks are centered on their position
      objMinX = pos.x - STACK_WIDTH / 2;
      objMinY = pos.y - STACK_HEIGHT / 2;
      objMaxX = pos.x + STACK_WIDTH / 2;
      objMaxY = pos.y + STACK_HEIGHT / 2;
    } else if (
      obj._kind === ObjectKind.Zone &&
      obj._meta?.width &&
      obj._meta?.height
    ) {
      // Zones use width/height from metadata
      const width = obj._meta.width as number;
      const height = obj._meta.height as number;
      objMinX = pos.x - width / 2;
      objMinY = pos.y - height / 2;
      objMaxX = pos.x + width / 2;
      objMaxY = pos.y + height / 2;
    } else if (obj._meta?.radius) {
      // Tokens/Mats/Counters use radius from metadata
      const radius = obj._meta.radius as number;
      objMinX = pos.x - radius;
      objMinY = pos.y - radius;
      objMaxX = pos.x + radius;
      objMaxY = pos.y + radius;
    } else {
      // Fallback: treat as point
      objMinX = pos.x;
      objMinY = pos.y;
      objMaxX = pos.x;
      objMaxY = pos.y;
    }

    minX = Math.min(minX, objMinX);
    minY = Math.min(minY, objMinY);
    maxX = Math.max(maxX, objMaxX);
    maxY = Math.max(maxY, objMaxY);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Get touch-aware dimensions for action handle.
 * Touch targets should be at least 44x44px for comfortable tapping.
 *
 * @param isTouch - Whether the device is touch-capable
 */
export function getHandleDimensions(isTouch: boolean) {
  if (isTouch) {
    return {
      handleWidth: 44,
      handleHeight: 44,
      expandedHeight: 52, // Larger touch targets in expanded state
      buttonSize: 48, // Individual action button size
      buttonGap: 8, // Gap between buttons
    };
  }
  return {
    handleWidth: 28,
    handleHeight: 28,
    expandedHeight: 44,
    buttonSize: 36,
    buttonGap: 6,
  };
}

/**
 * Calculate optimal position for action handle based on selection bounds
 * and viewport constraints.
 *
 * @param selectionBounds - Bounds of selected objects in world coordinates
 * @param viewportWidth - Width of the viewport in CSS pixels
 * @param viewportHeight - Height of the viewport in CSS pixels
 * @param cameraX - Not used (kept for backward compatibility)
 * @param cameraY - Not used (kept for backward compatibility)
 * @param cameraScale - Camera zoom scale
 * @param handleWidth - Width of the handle in pixels
 * @param handleHeight - Height of the handle in pixels
 * @param expandedWidth - Width of expanded bar in pixels (default 200)
 * @param expandedHeight - Height of expanded bar in pixels
 * @param margin - Margin from selection bounds in pixels (default 8)
 */
export function calculateHandlePosition(
  selectionBounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
  cameraX: number,
  cameraY: number,
  cameraScale: number,
  handleWidth: number,
  handleHeight: number,
  expandedWidth = 200,
  expandedHeight: number,
  margin = 8,
): HandlePosition {
  // Convert selection bounds from world to DOM coordinates
  // Formula matches PixiJS toGlobal() output divided by devicePixelRatio:
  // domX = (worldX * scale + canvasWidth / 2) / dpr
  // Since canvasWidth = viewportWidth * dpr, this simplifies to:
  // domX = worldX * scale / dpr + viewportWidth / 2
  // We assume dpr = 2 for now (TODO: pass dpr as parameter)
  const dpr = 2;
  const screenX = selectionBounds.x * cameraScale / dpr + viewportWidth / 2;
  const screenY = selectionBounds.y * cameraScale / dpr + viewportHeight / 2;
  const screenWidth = selectionBounds.width * cameraScale / dpr;
  const screenHeight = selectionBounds.height * cameraScale / dpr;

  // Default position: center of selection
  let x = screenX + screenWidth / 2;
  let y = screenY + screenHeight / 2;

  // Check if we need to flip to left side
  const needsLeftFlip = x + expandedWidth > viewportWidth - margin;
  if (needsLeftFlip) {
    x = screenX - margin;
  }

  // Check if we need to flip to bottom
  const needsBottomFlip = y - expandedHeight < margin;
  if (needsBottomFlip) {
    y = screenY + screenHeight + margin + handleHeight;
  }

  // Clamp to viewport bounds (fallback if still out of bounds)
  x = Math.max(margin, Math.min(x, viewportWidth - handleWidth - margin));
  y = Math.max(margin + expandedHeight, Math.min(y, viewportHeight - margin));

  return {
    x,
    y,
    flipToLeft: needsLeftFlip,
    flipToBottom: needsBottomFlip,
  };
}
