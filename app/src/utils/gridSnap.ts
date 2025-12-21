/**
 * Grid snapping utilities for precise object placement
 */

/** Fixed grid size in pixels */
export const GRID_SIZE = 100;

/** Grid origin in world coordinates */
export const GRID_ORIGIN = { x: 0, y: 0 };

/**
 * Snaps a position to the nearest grid point
 *
 * @param pos - The world position to snap (only x/y coordinates are snapped; rotation is ignored)
 * @param enabled - Whether grid snapping is enabled
 * @returns Object with snapped x and y coordinates { x: number; y: number }
 *          (rotation is NOT included - caller must preserve it separately)
 *          If disabled, returns the original position unchanged (without rotation)
 */
export function snapToGrid(
  pos: { x: number; y: number },
  enabled: boolean,
): { x: number; y: number } {
  if (!enabled) return pos;

  const relX = pos.x - GRID_ORIGIN.x;
  const relY = pos.y - GRID_ORIGIN.y;

  const snappedX = Math.round(relX / GRID_SIZE) * GRID_SIZE + GRID_ORIGIN.x;
  const snappedY = Math.round(relY / GRID_SIZE) * GRID_SIZE + GRID_ORIGIN.y;

  return { x: snappedX, y: snappedY };
}

/**
 * Snaps multiple objects to grid with collision avoidance.
 * Ensures each object gets its own unique grid space.
 *
 * @param objects - Array of objects with id and current position
 * @param enabled - Whether grid snapping is enabled
 * @returns Map of object ID to collision-free snapped position
 */
export function snapMultipleToGrid(
  objects: Array<{ id: string; pos: { x: number; y: number; r: number } }>,
  enabled: boolean,
): Map<string, { x: number; y: number; r: number }> {
  const result = new Map<string, { x: number; y: number; r: number }>();

  if (!enabled || objects.length === 0) {
    // If disabled, return original positions
    objects.forEach((obj) => {
      result.set(obj.id, { ...obj.pos });
    });
    return result;
  }

  // Track occupied grid points
  const occupiedPoints = new Set<string>();

  // Helper to create grid point key
  const gridKey = (x: number, y: number) => `${x},${y}`;

  // Helper to find nearest free grid point using spiral search
  const findNearestFreePoint = (
    targetX: number,
    targetY: number,
  ): { x: number; y: number } => {
    // Start at target and spiral outward
    let radius = 0;
    const maxRadius = 10; // Search up to 10 grid cells away

    while (radius <= maxRadius) {
      // Check all points at this radius
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Only check points at exactly this radius (Manhattan distance)
          if (Math.abs(dx) + Math.abs(dy) !== radius && radius > 0) continue;

          const testX = targetX + dx * GRID_SIZE;
          const testY = targetY + dy * GRID_SIZE;
          const key = gridKey(testX, testY);

          if (!occupiedPoints.has(key)) {
            return { x: testX, y: testY };
          }
        }
      }
      radius++;
    }

    // Fallback: return target even if occupied (shouldn't happen with maxRadius=10)
    return { x: targetX, y: targetY };
  };

  // Process each object in order
  objects.forEach((obj) => {
    // Calculate ideal snap position
    const idealSnap = snapToGrid(obj.pos, true);
    const key = gridKey(idealSnap.x, idealSnap.y);

    let finalX: number;
    let finalY: number;

    if (!occupiedPoints.has(key)) {
      // Grid point is free, claim it
      finalX = idealSnap.x;
      finalY = idealSnap.y;
      occupiedPoints.add(key);
    } else {
      // Collision detected, find nearest free point
      const freePoint = findNearestFreePoint(idealSnap.x, idealSnap.y);
      finalX = freePoint.x;
      finalY = freePoint.y;
      occupiedPoints.add(gridKey(finalX, finalY));
    }

    result.set(obj.id, { x: finalX, y: finalY, r: obj.pos.r });
  });

  return result;
}
