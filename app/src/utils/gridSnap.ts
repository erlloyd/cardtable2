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
 * @param pos - The world position to snap
 * @param enabled - Whether grid snapping is enabled
 * @returns The snapped position (or original if disabled)
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
