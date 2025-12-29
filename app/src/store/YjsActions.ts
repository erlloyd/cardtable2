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

          // For stacks, reverse card order to simulate physical flip
          if (kind === ObjectKind.Stack) {
            const cards = yMap.get('_cards');
            if (cards && Array.isArray(cards) && cards.length > 0) {
              const reversedCards = [...cards].reverse();
              yMap.set('_cards', reversedCards);
            }
          }

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
 * Stack objects - merge multiple stacks into one (M3.5-T3)
 *
 * Physical card behavior:
 * - Target stack cards remain at bottom
 * - Source stack cards placed on top (order between sources doesn't matter, but order within each stack preserved)
 *
 * Target stack state wins:
 * - All cards adopt target's _faceUp state
 * - All cards adopt target's _exhausted state (rotation)
 * - Target position preserved
 *
 * @param store - YjsStore instance
 * @param ids - Array of source stack IDs to merge into target
 * @param targetId - Optional target stack ID. If not provided, uses first id in ids array
 * @returns Array of successfully stacked source IDs
 *
 * @example
 * // Merge stack-2 into stack-1
 * stackObjects(store, ['stack-2'], 'stack-1');
 * // stack-1 now contains all cards (stack-1 cards at bottom, stack-2 cards on top)
 *
 * @example
 * // Merge multiple stacks (targetId defaults to first)
 * stackObjects(store, ['stack-1', 'stack-2', 'stack-3']);
 * // stack-1 becomes the target, stack-2 and stack-3 merge into it
 */
export function stackObjects(
  store: YjsStore,
  ids: string[],
  targetId?: string,
): string[] {
  // Determine target and source ids
  let target: string;
  let sourceIds: string[];

  if (targetId) {
    // Explicit target provided
    target = targetId;
    // Validate targetId not in ids array
    if (ids.includes(target)) {
      throw new Error('[stackObjects] targetId cannot appear in ids array');
    }
    sourceIds = ids;
  } else {
    // Use first id as target
    if (ids.length === 0) {
      throw new Error(
        '[stackObjects] No target stack specified and ids array is empty',
      );
    }
    target = ids[0];
    sourceIds = ids.slice(1); // Remaining ids are sources
  }

  // Get target stack
  const targetYMap = store.getObjectYMap(target);
  if (!targetYMap) {
    throw new Error(`[stackObjects] Target stack ${target} not found`);
  }

  // Verify target is a stack
  const targetKind = targetYMap.get('_kind');
  if (targetKind !== ObjectKind.Stack) {
    throw new Error(
      `[stackObjects] Target ${target} is not a stack (kind: ${targetKind})`,
    );
  }

  // Get target state (wins for merged stack)
  const targetCards = targetYMap.get('_cards') as string[];
  if (!targetCards) {
    throw new Error(
      `[stackObjects] Target stack ${target} has no _cards array`,
    );
  }

  // Collect cards from all source stacks
  const sourceStacksData: Array<{ id: string; cards: string[] }> = [];

  for (const sourceId of sourceIds) {
    const sourceYMap = store.getObjectYMap(sourceId);
    if (!sourceYMap) {
      console.warn(
        `[stackObjects] Source stack ${sourceId} not found, skipping`,
      );
      continue;
    }

    // Verify source is a stack
    const sourceKind = sourceYMap.get('_kind');
    if (sourceKind !== ObjectKind.Stack) {
      console.warn(
        `[stackObjects] Source ${sourceId} is not a stack (kind: ${sourceKind}), skipping`,
      );
      continue;
    }

    // Get source cards
    const sourceCards = sourceYMap.get('_cards') as string[];
    if (sourceCards && sourceCards.length > 0) {
      sourceStacksData.push({ id: sourceId, cards: sourceCards });
    }
  }

  // If no valid sources, return early
  if (sourceStacksData.length === 0) {
    console.warn('[stackObjects] No valid source stacks to merge');
    return [];
  }

  const stackedIds: string[] = [];

  // Use single transaction for atomicity
  store.getDoc().transact(() => {
    // Build new card array: target cards at bottom, source cards on top
    const newCards = [...targetCards];
    for (const sourceData of sourceStacksData) {
      newCards.push(...sourceData.cards);
      stackedIds.push(sourceData.id);
    }

    // Update target stack with merged cards
    targetYMap.set('_cards', newCards);

    // Delete source stacks
    for (const sourceData of sourceStacksData) {
      store.deleteObject(sourceData.id);
    }
  });

  console.log(
    `[stackObjects] Merged ${sourceStacksData.length} stack(s) into ${target}. ` +
      `Total cards: ${(targetYMap.get('_cards') as string[]).length}`,
  );

  return stackedIds;
}

/**
 * Unstack card - extract top card from a stack into a new stack (M3.5-T3)
 *
 * Extracts the top card (index 0) from a stack and creates a new single-card stack
 * at the specified position. The new stack inherits the source stack's face-up/down
 * state and rotation. If the source stack becomes empty after extraction, it is deleted.
 *
 * @param store - YjsStore instance
 * @param stackId - ID of the stack to extract from
 * @param pos - Position for the new single-card stack (x, y). Rotation (r) is ignored and inherited from source.
 * @returns ID of the newly created stack, or null if operation failed
 *
 * @example
 * // Extract top card from a stack and place at (150, 200)
 * // Note: Only x and y are used; rotation is inherited from source stack
 * const newStackId = unstackCard(store, 'stack-1', { x: 150, y: 200, r: 0 });
 * // Creates new single-card stack at (150, 200) with source stack's rotation and faceUp state
 * // stack-1 loses its top card (or is deleted if it was the last card)
 */
export function unstackCard(
  store: YjsStore,
  stackId: string,
  pos: Position,
): string | null {
  // Get source stack
  const sourceYMap = store.getObjectYMap(stackId);
  if (!sourceYMap) {
    console.warn(`[unstackCard] Stack ${stackId} not found`);
    return null;
  }

  // Verify source is a stack
  const sourceKind = sourceYMap.get('_kind');
  if (sourceKind !== ObjectKind.Stack) {
    console.warn(
      `[unstackCard] Object ${stackId} is not a stack (kind: ${sourceKind})`,
    );
    return null;
  }

  // Get source cards
  const sourceCards = sourceYMap.get('_cards') as string[];
  if (!sourceCards || sourceCards.length === 0) {
    console.warn(`[unstackCard] Stack ${stackId} has no cards`);
    return null;
  }

  // Extract top card (index 0)
  const topCard = sourceCards[0];
  const remainingCards = sourceCards.slice(1);

  // Get source stack state to preserve in new stack
  const sourceFaceUp = sourceYMap.get('_faceUp') as boolean;
  const sourcePos = sourceYMap.get('_pos') as Position;

  let newStackId: string | null = null;

  // Use single transaction for atomicity
  store.getDoc().transact(() => {
    // Create new single-card stack at specified position
    // Inherit face-up state and rotation from source stack
    newStackId = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: pos.x, y: pos.y, r: sourcePos.r }, // Inherit rotation
      cards: [topCard],
      faceUp: sourceFaceUp,
    });

    // Update or delete source stack
    if (remainingCards.length === 0) {
      // No cards left - delete source stack
      store.deleteObject(stackId);
      console.log(`[unstackCard] Deleted empty stack ${stackId}`);
    } else {
      // Update source stack with remaining cards
      sourceYMap.set('_cards', remainingCards);
      console.log(
        `[unstackCard] Updated stack ${stackId}, now has ${remainingCards.length} card(s)`,
      );
    }
  });

  console.log(
    `[unstackCard] Extracted card ${topCard} from ${stackId} to new stack ${newStackId}`,
  );

  return newStackId;
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
