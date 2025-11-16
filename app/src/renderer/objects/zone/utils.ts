import type { TableObject } from '@cardtable2/shared';
import {
  ZONE_DEFAULT_COLOR,
  ZONE_DEFAULT_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  ZONE_DEFAULT_GRID_SIZE,
} from './constants';

/** Get the color for a zone, with fallback to default */
export function getZoneColor(obj: TableObject): number {
  return (obj._meta?.color as number) ?? ZONE_DEFAULT_COLOR;
}

/** Get the width for a zone, with fallback to default */
export function getZoneWidth(obj: TableObject): number {
  return (obj._meta?.width as number) ?? ZONE_DEFAULT_WIDTH;
}

/** Get the height for a zone, with fallback to default */
export function getZoneHeight(obj: TableObject): number {
  return (obj._meta?.height as number) ?? ZONE_DEFAULT_HEIGHT;
}

/** Get the grid size for a zone, with fallback to default */
export function getGridSize(obj: TableObject): number {
  return (obj._meta?.gridSize as number) ?? ZONE_DEFAULT_GRID_SIZE;
}

/** Check if zone should snap to grid */
export function shouldSnapToGrid(obj: TableObject): boolean {
  return (obj._meta?.snapToGrid as boolean) ?? true;
}
