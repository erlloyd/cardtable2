import { v4 as uuidv4 } from 'uuid';
import type { YjsStore } from './YjsStore';
import {
  ObjectKind,
  type Position,
  type TableObject,
} from '@cardtable2/shared';

/**
 * Engine Actions for Yjs-based state manipulation (M3-T2)
 *
 * All actions execute within Yjs transactions for atomicity and undo/redo support.
 * These are pure functions that take a YjsStore instance and parameters.
 */

/**
 * Options for creating a new object
 */
export interface CreateObjectOptions {
  kind: ObjectKind;
  pos: Position;
  containerId?: string | null;
  locked?: boolean;
  meta?: Record<string, unknown>;
  // Stack-specific
  cards?: string[];
  faceUp?: boolean;
}

/**
 * Generate a sortKey that places the object on top of all existing objects
 * Uses fractional indexing format: "prefix|suffix"
 */
function generateTopSortKey(store: YjsStore): string {
  const allObjects = store.getAllObjects();

  // Find the maximum sortKey
  let maxSortKey = '0';
  allObjects.forEach((obj) => {
    if (obj._sortKey > maxSortKey) {
      maxSortKey = obj._sortKey;
    }
  });

  // Parse the max sortKey to get prefix
  const [prefix] = maxSortKey.split('|');
  const prefixNum = parseInt(prefix, 10) || 0;

  // Increment prefix to ensure new object is on top
  const newPrefix = (prefixNum + 1).toString();

  // Start with 'a' suffix for first object at this level
  return `${newPrefix}|a`;
}

/**
 * Create a new object on the table
 *
 * @param store - YjsStore instance
 * @param options - Object creation options
 * @returns The ID of the created object
 *
 * @example
 * // Create a stack with 2 cards
 * const stackId = createObject(store, {
 *   kind: ObjectKind.Stack,
 *   pos: { x: 100, y: 200, r: 0 },
 *   cards: ['card-1', 'card-2'],
 *   faceUp: true
 * });
 *
 * @example
 * // Create a token
 * const tokenId = createObject(store, {
 *   kind: ObjectKind.Token,
 *   pos: { x: 50, y: 75, r: 0 },
 *   meta: { color: 'red', value: 5 }
 * });
 */
export function createObject(
  store: YjsStore,
  options: CreateObjectOptions,
): string {
  const id = uuidv4();
  const sortKey = generateTopSortKey(store);

  // Build base object
  const baseObject: TableObject = {
    _kind: options.kind,
    _containerId: options.containerId ?? null,
    _pos: options.pos,
    _sortKey: sortKey,
    _locked: options.locked ?? false,
    _selectedBy: null, // New objects are not selected
    _meta: options.meta ?? {},
  };

  // Create object using YjsStore's setObject (which uses transactions internally)
  if (options.kind === ObjectKind.Stack) {
    // Stack-specific fields
    const stackObject = {
      ...baseObject,
      _kind: ObjectKind.Stack,
      _cards: options.cards ?? [],
      _faceUp: options.faceUp ?? true,
    };
    store.setObject(id, stackObject);
  } else {
    // Other object types (Token, Zone, Mat, Counter)
    store.setObject(id, baseObject);
  }

  return id;
}

/**
 * Update positions for one or more objects
 *
 * @param store - YjsStore instance
 * @param updates - Array of position updates
 *
 * @example
 * // Move a single object
 * moveObjects(store, [{
 *   id: 'obj-123',
 *   pos: { x: 150, y: 250, r: 45 }
 * }]);
 *
 * @example
 * // Move multiple objects (e.g., after multi-select drag)
 * moveObjects(store, [
 *   { id: 'obj-1', pos: { x: 100, y: 100, r: 0 } },
 *   { id: 'obj-2', pos: { x: 200, y: 200, r: 0 } }
 * ]);
 */
export function moveObjects(
  store: YjsStore,
  updates: Array<{ id: string; pos: Position }>,
): void {
  // Use single transaction for atomicity
  store.getDoc().transact(() => {
    updates.forEach(({ id, pos }) => {
      const obj = store.getObject(id);
      if (!obj) {
        console.warn(`[moveObjects] Object ${id} not found`);
        return;
      }

      // Update position using setObject (which internally uses transactions)
      // We're already in a transaction, so this will be batched
      store.setObject(id, {
        ...obj,
        _pos: pos,
      });
    });
  });
}

/**
 * Select objects with exclusive ownership tracking (M3-T3)
 *
 * Attempts to claim selection ownership for the given objects. Selection fails
 * gracefully for objects already owned by another actor.
 *
 * @param store - YjsStore instance
 * @param ids - Array of object IDs to select
 * @param actorId - Actor ID claiming ownership (typically store.getActorId())
 * @returns Object with success/failure lists
 *
 * @example
 * const result = selectObjects(store, ['obj-1', 'obj-2'], store.getActorId());
 * console.log('Selected:', result.selected);
 * console.log('Failed (already owned):', result.failed);
 */
export function selectObjects(
  store: YjsStore,
  ids: string[],
  actorId: string,
): { selected: string[]; failed: string[] } {
  const selected: string[] = [];
  const failed: string[] = [];

  store.getDoc().transact(() => {
    ids.forEach((id) => {
      const obj = store.getObject(id);
      if (!obj) {
        console.warn(`[selectObjects] Object ${id} not found`);
        failed.push(id);
        return;
      }

      // Check if already selected by another actor
      if (obj._selectedBy !== null && obj._selectedBy !== actorId) {
        console.warn(
          `[selectObjects] Object ${id} already selected by ${obj._selectedBy}`,
        );
        failed.push(id);
        return;
      }

      // Skip if already selected by this actor (idempotent)
      if (obj._selectedBy === actorId) {
        return;
      }

      // Check if object is locked
      if (obj._locked) {
        console.warn(`[selectObjects] Object ${id} is locked`);
        failed.push(id);
        return;
      }

      // Claim ownership
      store.setObject(id, {
        ...obj,
        _selectedBy: actorId,
      });
      selected.push(id);
    });
  });

  return { selected, failed };
}

/**
 * Unselect objects, releasing ownership (M3-T3)
 *
 * Only releases selection if the object is currently selected by the given actor.
 *
 * @param store - YjsStore instance
 * @param ids - Array of object IDs to unselect
 * @param actorId - Actor ID releasing ownership
 * @returns Array of successfully unselected object IDs
 *
 * @example
 * const unselected = unselectObjects(store, ['obj-1', 'obj-2'], store.getActorId());
 * console.log('Unselected:', unselected);
 */
export function unselectObjects(
  store: YjsStore,
  ids: string[],
  actorId: string,
): string[] {
  const unselected: string[] = [];

  store.getDoc().transact(() => {
    ids.forEach((id) => {
      const obj = store.getObject(id);
      if (!obj) {
        console.warn(`[unselectObjects] Object ${id} not found`);
        return;
      }

      // Only unselect if currently selected by this actor
      if (obj._selectedBy !== actorId) {
        console.warn(
          `[unselectObjects] Object ${id} not selected by ${actorId} (currently: ${obj._selectedBy})`,
        );
        return;
      }

      // Release ownership
      store.setObject(id, {
        ...obj,
        _selectedBy: null,
      });
      unselected.push(id);
    });
  });

  return unselected;
}

/**
 * Clear all selections in the store, optionally excluding objects being dragged (M3-T3)
 *
 * This is a force-clear that removes all selection ownership, useful for
 * "reset" scenarios or cleaning up stale selections.
 *
 * @param store - YjsStore instance
 * @param options - Configuration options
 * @param options.excludeDragging - If true, don't clear objects currently being dragged
 * @returns Number of selections cleared
 *
 * @example
 * // Clear all selections
 * const cleared = clearAllSelections(store);
 * console.log(`Cleared ${cleared} selections`);
 *
 * @example
 * // Clear all except dragging objects
 * const cleared = clearAllSelections(store, { excludeDragging: true });
 */
export function clearAllSelections(
  store: YjsStore,
  options: { excludeDragging?: boolean } = {},
): number {
  let cleared = 0;

  store.getDoc().transact(() => {
    const allObjects = store.getAllObjects();
    allObjects.forEach((obj, id) => {
      // Skip if no selection to clear
      if (obj._selectedBy === null) {
        return;
      }

      // TODO: Implement excludeDragging logic when awareness/drag state is available (M3-T4)
      // For now, excludeDragging is not implemented as we don't have drag state tracking yet
      if (options.excludeDragging) {
        throw new Error(
          '[clearAllSelections] excludeDragging option is not implemented yet (requires M3-T4 awareness)',
        );
      }

      // Clear selection
      store.setObject(id, {
        ...obj,
        _selectedBy: null,
      });
      cleared++;
    });
  });

  return cleared;
}
