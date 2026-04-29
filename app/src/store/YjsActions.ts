import { v4 as uuidv4 } from 'uuid';
import type { YjsStore } from './YjsStore';
import {
  ObjectKind,
  type Position,
  type TableObject,
  type AttachmentLayout,
  DEFAULT_ATTACHMENT_LAYOUT,
  parseSortKeyPrefix,
  formatSortKey,
  sortKeyBase,
  sortKeyWithSub,
  PARENT_ON_TOP_SUB_KEY,
} from '@cardtable2/shared';
import { getDefaultProperties } from './ObjectDefaults';
import { computeAttachmentPositions } from './attachmentLayout';

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
export function generateTopSortKey(store: YjsStore): string {
  let maxPrefix = 0;
  store.forEachObject((yMap) => {
    const sortKey = yMap.get('_sortKey');
    if (sortKey) {
      const prefix = parseSortKeyPrefix(sortKey);
      if (prefix > maxPrefix) maxPrefix = prefix;
    }
  });
  return formatSortKey(maxPrefix + 1);
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
  layout?: AttachmentLayout,
): void {
  // Use single transaction for atomicity
  store.getDoc().transact(() => {
    // First pass: move the requested objects and collect parents that have attachments
    const parentsToUpdate: Array<{ id: string; pos: Position }> = [];

    // Bring all moved objects to the top by assigning new sortKeys
    const movedIds = new Set(updates.map((u) => u.id));
    let maxPrefix = 0;
    store.forEachObject((yMap) => {
      const sortKey = yMap.get('_sortKey');
      if (sortKey) {
        const prefix = parseSortKeyPrefix(sortKey);
        if (prefix > maxPrefix) maxPrefix = prefix;
      }
    });
    const newBaseKey = formatSortKey(maxPrefix + 1);

    updates.forEach(({ id, pos }) => {
      const yMap = store.getObjectYMap(id);
      if (!yMap) {
        console.warn(`[moveObjects] Object ${id} not found`);
        return;
      }

      // Update position directly on Y.Map
      yMap.set('_pos', pos);

      // Update sortKey: preserve attachment sub-key structure, replace base prefix
      if (movedIds.has(id)) {
        const oldKey = yMap.get('_sortKey') as string;
        const segments = oldKey.split('|');
        const newKey =
          segments.length > 1
            ? [newBaseKey, ...segments.slice(1)].join('|')
            : newBaseKey;
        yMap.set('_sortKey', newKey);
      }

      // Check if this object has attached cards that need to move too
      const attachedCardIds: string[] | undefined =
        yMap.get('_attachedCardIds');
      if (attachedCardIds && attachedCardIds.length > 0) {
        parentsToUpdate.push({ id, pos });
      }
    });

    // Second pass: recompute attachment positions for parents that moved
    for (const { id, pos } of parentsToUpdate) {
      const yMap = store.getObjectYMap(id);
      if (!yMap) continue;

      const attachedCardIds = yMap.get('_attachedCardIds') as string[];
      const effectiveLayout = layout ?? DEFAULT_ATTACHMENT_LAYOUT;
      const fanPositions = computeAttachmentPositions(
        pos,
        attachedCardIds.length,
        effectiveLayout,
      );

      for (let i = 0; i < attachedCardIds.length; i++) {
        const childYMap = store.getObjectYMap(attachedCardIds[i]);
        if (childYMap) {
          childYMap.set('_pos', fanPositions[i]);
        }
      }
    }
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
    // Build new card array: source cards on top, target cards at bottom
    // (index 0 is top of stack, so source goes first)
    const newCards = [];
    for (const sourceData of sourceStacksData) {
      newCards.push(...sourceData.cards);
      stackedIds.push(sourceData.id);
    }
    newCards.push(...targetCards);

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
 * Shuffle stack - randomize card order using Fisher-Yates algorithm
 *
 * Randomly shuffles the cards array in a stack. The shuffle is performed
 * atomically in a Yjs transaction to ensure consistency in multiplayer.
 *
 * @param store - YjsStore instance
 * @param stackId - ID of the stack to shuffle
 * @returns true if shuffle succeeded, false if stack not found or invalid
 *
 * @example
 * // Shuffle a deck
 * const success = shuffleStack(store, 'stack-123');
 */
export function shuffleStack(store: YjsStore, stackId: string): boolean {
  const yMap = store.getObjectYMap(stackId);
  if (!yMap) {
    console.error(`[shuffleStack] Stack ${stackId} not found`);
    return false;
  }

  // Verify it's a stack
  const kind = yMap.get('_kind');
  if (kind !== ObjectKind.Stack) {
    console.error(
      `[shuffleStack] Object ${stackId} is not a stack (kind: ${kind})`,
    );
    return false;
  }

  // Get cards array
  const cards = yMap.get('_cards') as string[];
  if (!cards || cards.length < 2) {
    console.error(
      `[shuffleStack] Stack ${stackId} has insufficient cards (${cards?.length ?? 0})`,
    );
    return false;
  }

  // Use single transaction for atomicity
  store.getDoc().transact(() => {
    // Fisher-Yates shuffle (in-place)
    const shuffled = [...cards]; // Copy to avoid mutating
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Update cards array
    yMap.set('_cards', shuffled);
  });

  console.log(
    `[shuffleStack] Shuffled stack ${stackId} (${cards.length} cards)`,
  );
  return true;
}

// ============================================================================
// Card-on-Card Attachment Actions
// ============================================================================

/**
 * Attach cards to a target stack.
 *
 * For each source stack:
 * - If it has multiple cards, each card is split into individual stacks first
 * - Each resulting single-card stack becomes an attachment on the target
 * - Multi-card source stacks are deleted after splitting
 *
 * @param store - YjsStore instance
 * @param sourceIds - IDs of stacks to attach to the target
 * @param targetId - ID of the target stack to attach to
 * @param layout - Attachment layout config (defaults to below, 0.25 reveal)
 * @returns Array of attached card stack IDs
 */
export function attachCards(
  store: YjsStore,
  sourceIds: string[],
  targetId: string,
  layout?: AttachmentLayout,
): string[] {
  const targetYMap = store.getObjectYMap(targetId);
  if (!targetYMap) {
    console.warn(`[attachCards] Target stack ${targetId} not found`);
    return [];
  }

  const targetKind = targetYMap.get('_kind');
  if (targetKind !== ObjectKind.Stack) {
    console.warn(
      `[attachCards] Target ${targetId} is not a stack (kind: ${targetKind})`,
    );
    return [];
  }

  const targetPos = targetYMap.get('_pos') as Position;
  const rawAttachments = (targetYMap.get('_attachedCardIds') as string[]) ?? [];
  // Filter out dangling IDs (deleted objects) to prevent broken fan positioning
  const existingAttachments = rawAttachments.filter(
    (id) => store.getObjectYMap(id) != null,
  );
  const attachedIds: string[] = [];
  const effectiveLayout = layout ?? DEFAULT_ATTACHMENT_LAYOUT;

  store.getDoc().transact(() => {
    const newAttachmentIds: string[] = [...existingAttachments];

    for (const sourceId of sourceIds) {
      if (sourceId === targetId) continue; // Can't attach to self

      const sourceYMap = store.getObjectYMap(sourceId);
      if (!sourceYMap) {
        console.warn(`[attachCards] Source ${sourceId} not found, skipping`);
        continue;
      }

      const sourceKind = sourceYMap.get('_kind');
      if (sourceKind !== ObjectKind.Stack) {
        console.warn(
          `[attachCards] Source ${sourceId} is not a stack, skipping`,
        );
        continue;
      }

      // If source is already attached to something, detach it first
      const existingParentId: string | undefined =
        sourceYMap.get('_attachedToId');
      if (existingParentId) {
        const parentYMap = store.getObjectYMap(existingParentId);
        if (parentYMap) {
          const parentAttachments =
            (parentYMap.get('_attachedCardIds') as string[]) ?? [];
          parentYMap.set(
            '_attachedCardIds',
            parentAttachments.filter((id: string) => id !== sourceId),
          );
        }
        sourceYMap.set('_attachedToId', undefined);
      }

      const sourceCards = sourceYMap.get('_cards') as string[];
      const sourceFaceUp = sourceYMap.get('_faceUp') as boolean;

      if (sourceCards && sourceCards.length > 1) {
        // Multi-card stack: split each card into individual stacks
        for (const cardId of sourceCards) {
          const newStackId = createObject(store, {
            kind: ObjectKind.Stack,
            pos: targetPos, // Temporary position, will be recalculated
            cards: [cardId],
            faceUp: sourceFaceUp,
          });

          const newYMap = store.getObjectYMap(newStackId);
          if (newYMap) {
            newYMap.set('_attachedToId', targetId);
          } else {
            console.error(
              `[attachCards] Failed to find YMap for newly created stack ${newStackId}`,
            );
          }
          newAttachmentIds.push(newStackId);
          attachedIds.push(newStackId);
        }

        // Delete the original multi-card source stack
        store.deleteObject(sourceId);
      } else {
        // Single-card stack: attach directly
        sourceYMap.set('_attachedToId', targetId);
        newAttachmentIds.push(sourceId);
        attachedIds.push(sourceId);
      }
    }

    // Update target's attachment list
    targetYMap.set('_attachedCardIds', newAttachmentIds);

    // Compute fan positions for all attachments
    const fanPositions = computeAttachmentPositions(
      targetPos,
      newAttachmentIds.length,
      effectiveLayout,
    );

    for (let i = 0; i < newAttachmentIds.length; i++) {
      const childYMap = store.getObjectYMap(newAttachmentIds[i]);
      if (childYMap) {
        childYMap.set('_pos', fanPositions[i]);
      }
    }

    // Assign sortKeys so parent/child z-ordering is encoded in the key itself
    const baseKey = targetYMap.get('_sortKey') as string;
    // Strip any existing sub-key suffix to get the base prefix
    const parentBaseKey = sortKeyBase(baseKey);
    const parentOnTop = effectiveLayout.parentOnTop !== false;
    const childCount = newAttachmentIds.length;

    if (parentOnTop) {
      // Parent gets highest sub-key, children get reverse-indexed below
      targetYMap.set(
        '_sortKey',
        sortKeyWithSub(parentBaseKey, PARENT_ON_TOP_SUB_KEY),
      );
      for (let i = 0; i < childCount; i++) {
        const childYMap = store.getObjectYMap(newAttachmentIds[i]);
        if (childYMap) {
          const subKey = formatSortKey(childCount - i);
          childYMap.set('_sortKey', sortKeyWithSub(parentBaseKey, subKey));
        }
      }
    } else {
      // Parent gets lowest sub-key, children get forward-indexed above
      targetYMap.set(
        '_sortKey',
        sortKeyWithSub(parentBaseKey, formatSortKey(1)),
      );
      for (let i = 0; i < childCount; i++) {
        const childYMap = store.getObjectYMap(newAttachmentIds[i]);
        if (childYMap) {
          const subKey = formatSortKey(i + 2);
          childYMap.set('_sortKey', sortKeyWithSub(parentBaseKey, subKey));
        }
      }
    }
  });

  console.log(
    `[attachCards] Attached ${attachedIds.length} card(s) to ${targetId}`,
  );
  return attachedIds;
}

/**
 * Detach a single card from its parent stack.
 *
 * The card keeps its current position. Remaining attachments are repositioned
 * to close the gap.
 *
 * @param store - YjsStore instance
 * @param cardId - ID of the attached card stack to detach
 * @param layout - Attachment layout config (defaults to below, 0.25 reveal)
 * @returns true if detached successfully
 */
export function detachCard(
  store: YjsStore,
  cardId: string,
  layout?: AttachmentLayout,
): boolean {
  const cardYMap = store.getObjectYMap(cardId);
  if (!cardYMap) {
    console.warn(`[detachCard] Card ${cardId} not found`);
    return false;
  }

  const parentId: string | undefined = cardYMap.get('_attachedToId');
  if (!parentId) {
    console.warn(`[detachCard] Card ${cardId} is not attached to anything`);
    return false;
  }

  const parentYMap = store.getObjectYMap(parentId);
  if (!parentYMap) {
    console.warn(`[detachCard] Parent ${parentId} not found`);
    // Clean up the orphaned reference
    cardYMap.set('_attachedToId', undefined);
    return false;
  }

  const effectiveLayout = layout ?? DEFAULT_ATTACHMENT_LAYOUT;

  store.getDoc().transact(() => {
    // Remove from parent's list
    const attachedIds = (parentYMap.get('_attachedCardIds') as string[]) ?? [];
    const remaining = attachedIds.filter((id: string) => id !== cardId);
    parentYMap.set(
      '_attachedCardIds',
      remaining.length > 0 ? remaining : undefined,
    );

    // Clear the child's reference
    cardYMap.set('_attachedToId', undefined);

    // Give detached card a fresh top-level sortKey above all existing objects
    const parentSortKey = parentYMap.get('_sortKey') as string;
    const parentBaseKey = sortKeyBase(parentSortKey);
    cardYMap.set('_sortKey', generateTopSortKey(store));

    // Recompute positions and sortKeys for remaining attachments
    if (remaining.length > 0) {
      const parentPos = parentYMap.get('_pos') as Position;
      const fanPositions = computeAttachmentPositions(
        parentPos,
        remaining.length,
        effectiveLayout,
      );

      const parentOnTop = effectiveLayout.parentOnTop !== false;
      const childCount = remaining.length;

      for (let i = 0; i < childCount; i++) {
        const childYMap = store.getObjectYMap(remaining[i]);
        if (childYMap) {
          childYMap.set('_pos', fanPositions[i]);
          if (parentOnTop) {
            const subKey = formatSortKey(childCount - i);
            childYMap.set('_sortKey', sortKeyWithSub(parentBaseKey, subKey));
          } else {
            const subKey = formatSortKey(i + 2);
            childYMap.set('_sortKey', sortKeyWithSub(parentBaseKey, subKey));
          }
        }
      }
    } else {
      // No children left — restore parent to base key
      parentYMap.set('_sortKey', parentBaseKey);
    }
  });

  console.log(`[detachCard] Detached card ${cardId} from ${parentId}`);
  return true;
}

/**
 * Detach all cards from a parent stack.
 *
 * Each card keeps its current position.
 *
 * @param store - YjsStore instance
 * @param parentId - ID of the parent stack
 * @returns Array of detached card stack IDs
 */
export function detachAllCards(store: YjsStore, parentId: string): string[] {
  const parentYMap = store.getObjectYMap(parentId);
  if (!parentYMap) {
    console.warn(`[detachAllCards] Parent ${parentId} not found`);
    return [];
  }

  const attachedIds = (parentYMap.get('_attachedCardIds') as string[]) ?? [];
  if (attachedIds.length === 0) {
    return [];
  }

  const detachedIds: string[] = [];

  store.getDoc().transact(() => {
    // Get parent's base key to restore after detaching children
    const parentSortKey = parentYMap.get('_sortKey') as string;
    const parentBaseKey = sortKeyBase(parentSortKey);

    // Each detached child gets a unique sortKey above all existing objects
    for (const cardId of attachedIds) {
      const childYMap = store.getObjectYMap(cardId);
      if (childYMap) {
        childYMap.set('_attachedToId', undefined);
        childYMap.set('_sortKey', generateTopSortKey(store));
        detachedIds.push(cardId);
      }
    }
    parentYMap.set('_attachedCardIds', undefined);
    // Restore parent to base key
    parentYMap.set('_sortKey', parentBaseKey);
  });

  console.log(
    `[detachAllCards] Detached ${detachedIds.length} card(s) from ${parentId}`,
  );
  return detachedIds;
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
export function resetTable(store: YjsStore): void {
  store.clearAllObjects();
  store.metadata.delete('loadedScenario');
  store.metadata.delete('pluginId');
  store.setGameAssets(null);
}

/**
 * Reset the table and create a test scene with various object types
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
