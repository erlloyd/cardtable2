import { v4 as uuidv4 } from 'uuid';
import type { YjsStore } from './YjsStore';
import {
  ObjectKind,
  type Position,
  type TableObject,
} from '@cardtable2/shared';
import { getDefaultProperties } from './ObjectDefaults';

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
 * Generate a sortKey that places the object on top of all existing objects (M3.6-T5)
 * Uses fractional indexing format: "prefix|suffix"
 * Refactored to work with Y.Maps directly - zero allocations.
 */
function generateTopSortKey(store: YjsStore): string {
  // Find the maximum sortKey by iterating Y.Maps directly
  let maxSortKey = '0';
  store.forEachObject((yMap) => {
    const sortKey = yMap.get('_sortKey');
    if (sortKey && sortKey > maxSortKey) {
      maxSortKey = sortKey;
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

  // Get default properties for this kind from centralized defaults
  const defaults = getDefaultProperties(options.kind);

  // Build base object with defaults
  const baseObject: TableObject = {
    _kind: options.kind,
    _containerId: options.containerId ?? null,
    _pos: options.pos,
    _sortKey: sortKey,
    _locked: options.locked ?? false,
    _selectedBy: null, // New objects are not selected
    _meta: options.meta ?? {},
    ...defaults, // Apply kind-specific defaults
  };

  // Override defaults with provided options (if any)
  if (options.kind === ObjectKind.Stack) {
    // Stack-specific fields
    const stackObject = {
      ...baseObject,
      _kind: ObjectKind.Stack,
      _cards: options.cards ?? (defaults._cards as string[]),
      _faceUp: options.faceUp ?? (defaults._faceUp as boolean),
    };
    store.setObject(id, stackObject);
  } else if (options.kind === ObjectKind.Token) {
    // Token-specific fields
    const tokenObject = {
      ...baseObject,
      _kind: ObjectKind.Token,
      _faceUp: options.faceUp ?? (defaults._faceUp as boolean),
    };
    store.setObject(id, tokenObject);
  } else {
    // Other object types (Zone, Mat, Counter)
    store.setObject(id, baseObject);
  }

  return id;
}

/**
 * Update positions for one or more objects (M3.6-T5)
 *
 * Refactored to work with Y.Maps directly - zero allocations.
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
      const yMap = store.getObjectYMap(id);
      if (!yMap) {
        console.warn(`[moveObjects] Object ${id} not found`);
        return;
      }

      // Update position directly on Y.Map - no conversion needed
      yMap.set('_pos', pos);
    });
  });
}

/**
 * Select objects with exclusive ownership tracking (M3-T3, M3.6-T5)
 *
 * Refactored to work with Y.Maps directly - zero allocations.
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
      const yMap = store.getObjectYMap(id);
      if (!yMap) {
        console.warn(`[selectObjects] Object ${id} not found`);
        failed.push(id);
        return;
      }

      // Read properties directly from Y.Map
      const selectedBy = yMap.get('_selectedBy');
      const locked = yMap.get('_locked');

      // Check if already selected by another actor
      if (selectedBy !== null && selectedBy !== actorId) {
        console.warn(
          `[selectObjects] Object ${id} already selected by ${selectedBy}`,
        );
        failed.push(id);
        return;
      }

      // Skip if already selected by this actor (idempotent)
      if (selectedBy === actorId) {
        return;
      }

      // Check if object is locked
      if (locked) {
        console.warn(`[selectObjects] Object ${id} is locked`);
        failed.push(id);
        return;
      }

      // Claim ownership - update Y.Map directly
      yMap.set('_selectedBy', actorId);
      selected.push(id);
    });
  });

  return { selected, failed };
}

/**
 * Unselect objects, releasing ownership (M3-T3, M3.6-T5)
 *
 * Refactored to work with Y.Maps directly - zero allocations.
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
      const yMap = store.getObjectYMap(id);
      if (!yMap) {
        console.warn(`[unselectObjects] Object ${id} not found`);
        return;
      }

      // Read property directly from Y.Map
      const selectedBy = yMap.get('_selectedBy');

      // Only unselect if currently selected by this actor
      if (selectedBy !== actorId) {
        console.warn(
          `[unselectObjects] Object ${id} not selected by ${actorId} (currently: ${selectedBy})`,
        );
        return;
      }

      // Release ownership - update Y.Map directly
      yMap.set('_selectedBy', null);
      unselected.push(id);
    });
  });

  return unselected;
}

/**
 * Clear all selections in the store, optionally excluding objects being dragged (M3-T3, M3.6-T5)
 *
 * Refactored to work with Y.Maps directly - zero allocations.
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
    // Iterate Y.Maps directly - no conversion needed
    store.forEachObject((yMap) => {
      // Read property directly from Y.Map
      const selectedBy = yMap.get('_selectedBy');

      // Skip if no selection to clear
      if (selectedBy === null) {
        return;
      }

      // TODO: Implement excludeDragging logic when awareness/drag state is available (M3-T4)
      // For now, excludeDragging is not implemented as we don't have drag state tracking yet
      if (options.excludeDragging) {
        throw new Error(
          '[clearAllSelections] excludeDragging option is not implemented yet (requires M3-T4 awareness)',
        );
      }

      // Clear selection - update Y.Map directly
      yMap.set('_selectedBy', null);
      cleared++;
    });
  });

  return cleared;
}

/**
 * Flip cards/tokens to toggle their face up/down state (M3.5-T1, M3.6-T5)
 *
 * Refactored to work with Y.Maps directly - zero allocations.
 *
 * Only affects objects that support flipping (stacks and tokens).
 * Non-flippable objects are silently skipped.
 *
 * @param store - YjsStore instance
 * @param ids - Array of object IDs to flip
 * @returns Array of successfully flipped object IDs
 *
 * @example
 * // Flip selected cards
 * const flipped = flipCards(store, ['stack-1', 'token-1', 'zone-1']);
 * console.log('Flipped:', flipped); // ['stack-1', 'token-1'] (zone skipped)
 */
export function flipCards(store: YjsStore, ids: string[]): string[] {
  const flipped: string[] = [];

  store.getDoc().transact(() => {
    ids.forEach((id) => {
      const yMap = store.getObjectYMap(id);
      if (!yMap) {
        console.warn(`[flipCards] Object ${id} not found`);
        return;
      }

      // Read properties directly from Y.Map
      const kind = yMap.get('_kind');
      const faceUp = yMap.get('_faceUp');

      // Only flip stacks and tokens (objects with _faceUp property)
      if (kind === ObjectKind.Stack || kind === ObjectKind.Token) {
        if (typeof faceUp === 'boolean') {
          // Toggle faceUp - update Y.Map directly
          yMap.set('_faceUp', !faceUp);
          flipped.push(id);
        } else {
          console.warn(
            `[flipCards] Object ${id} is a ${kind} but missing _faceUp property`,
          );
        }
      }
      // Silently skip non-flippable objects (zones, mats, counters)
    });
  });

  return flipped;
}

/**
 * Normalize rotation to prevent floating point drift
 * Rounds to 1 decimal place for consistency
 */
function normalizeRotation(r: number): number {
  return Math.round(r * 10) / 10;
}

/**
 * Exhaust/Ready cards - toggle rotation by 90 degrees (M3.5-T2, M3.6-T5)
 *
 * Refactored to work with Y.Maps directly - zero allocations.
 *
 * Exhausts (rotates 90°) or readies (rotates back to 0°) stack objects.
 * This is a toggle: exhausted stacks return to 0°, non-exhausted stacks rotate to 90°.
 * Only affects stacks - non-stack objects are silently skipped.
 *
 * @param store - YjsStore instance
 * @param ids - Array of object IDs to exhaust/ready
 * @returns Array of successfully exhausted/readied object IDs
 *
 * @example
 * // Exhaust selected cards
 * const exhausted = exhaustCards(store, ['stack-1', 'stack-2', 'zone-1']);
 * console.log('Exhausted/Readied:', exhausted); // ['stack-1', 'stack-2'] (zone skipped)
 */
export function exhaustCards(store: YjsStore, ids: string[]): string[] {
  const EXHAUST_ROTATION = 90;
  const ROTATION_EPSILON = 0.1; // Tight tolerance for floating point error
  const toggled: string[] = [];

  store.getDoc().transact(() => {
    ids.forEach((id) => {
      const yMap = store.getObjectYMap(id);
      if (!yMap) {
        console.warn(`[exhaustCards] Object ${id} not found`);
        return;
      }

      // Read properties directly from Y.Map
      const kind = yMap.get('_kind');
      const pos = yMap.get('_pos');

      // Only exhaust stacks
      if (kind === ObjectKind.Stack && pos) {
        // Toggle: if exhausted (90°), ready to 0°, otherwise exhaust to 90°
        const isExhausted =
          Math.abs(pos.r - EXHAUST_ROTATION) < ROTATION_EPSILON;
        const newRotation = normalizeRotation(
          isExhausted ? 0 : EXHAUST_ROTATION,
        );

        // Update position directly on Y.Map - no conversion needed
        yMap.set('_pos', {
          ...pos,
          r: newRotation,
        });
        toggled.push(id);
      }
      // Silently skip non-stack objects
    });
  });

  return toggled;
}

/**
 * Reset the table to a test scene with various object types.
 * Useful for development and testing.
 *
 * Creates:
 * - 5 stacks (cards) in top left area
 * - 3 tokens in top right area
 * - 2 zones in middle area
 * - 3 mats in bottom left area
 * - 2 counters in bottom right area
 *
 * @param store - YjsStore instance
 */
export function resetToTestScene(store: YjsStore): void {
  // Clear existing objects
  store.clearAllObjects();

  const colors = [
    0x6c5ce7, // Purple
    0x00b894, // Green
    0xfdcb6e, // Yellow
    0xe17055, // Red
    0x74b9ff, // Blue
  ];

  // Create 5 stacks (cards) - top left area with varying card counts
  const cardCounts = [1, 2, 3, 5, 1]; // Different stack sizes for visual testing
  for (let i = 0; i < 5; i++) {
    const cards: string[] = [];
    for (let j = 0; j < cardCounts[i]; j++) {
      cards.push(`test-card-${i + 1}-${j + 1}`);
    }
    createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: -300 + i * 80, y: -200, r: 0 },
      cards,
      faceUp: true,
      meta: { color: colors[i % colors.length] },
    });
  }

  // Create 3 tokens - top right area
  for (let i = 0; i < 3; i++) {
    createObject(store, {
      kind: ObjectKind.Token,
      pos: { x: 150 + i * 100, y: -200, r: 0 },
      meta: {
        size: 40,
        color: colors[(i + 1) % colors.length],
      },
    });
  }

  // Create 2 zones - middle area
  for (let i = 0; i < 2; i++) {
    createObject(store, {
      kind: ObjectKind.Zone,
      pos: { x: -150 + i * 350, y: 0, r: 0 },
      meta: {
        width: 300,
        height: 200,
        color: colors[(i + 2) % colors.length],
      },
    });
  }

  // Create 3 mats - bottom left area
  for (let i = 0; i < 3; i++) {
    createObject(store, {
      kind: ObjectKind.Mat,
      pos: { x: -250 + i * 100, y: 200, r: 0 },
      meta: {
        size: 50,
        color: colors[(i + 3) % colors.length],
      },
    });
  }

  // Create 2 counters - bottom right area
  for (let i = 0; i < 2; i++) {
    createObject(store, {
      kind: ObjectKind.Counter,
      pos: { x: 150 + i * 120, y: 200, r: 0 },
      meta: {
        size: 45,
        color: colors[(i + 4) % colors.length],
      },
    });
  }

  console.log(
    '[resetToTestScene] Created test scene: 5 stacks (1,2,3,5,1 cards), 3 tokens, 2 zones, 3 mats, 2 counters',
  );
}
