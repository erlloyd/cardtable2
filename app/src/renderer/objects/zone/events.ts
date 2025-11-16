import type { EventHandlers } from '../types';
import { getGridSize, shouldSnapToGrid } from './utils';
import type { TableObject } from '@cardtable2/shared';

export const ZoneEventHandlers: Partial<EventHandlers> = {
  // Zone-specific drop behavior with grid snapping
  onDrop(zone: TableObject, droppedObj: TableObject | null) {
    if (!droppedObj) return;

    if (shouldSnapToGrid(zone)) {
      const gridSize = getGridSize(zone);
      const snappedX = Math.round(droppedObj._pos.x / gridSize) * gridSize;
      const snappedY = Math.round(droppedObj._pos.y / gridSize) * gridSize;

      droppedObj._pos.x = snappedX;
      droppedObj._pos.y = snappedY;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    droppedObj._containerId = zone._id;
  },
};
