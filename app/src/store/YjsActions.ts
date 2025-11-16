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
