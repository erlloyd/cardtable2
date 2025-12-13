import type { YjsStore } from './YjsStore';
import { ObjectKind } from '@cardtable2/shared';

/**
 * YjsSelectors - Pure functions for querying derived state from YjsStore.
 * Follows the same pattern as YjsActions: functions that take store as first parameter.
 *
 * Pattern:
 * - Store = data access + subscriptions (YjsStore)
 * - Actions = mutations (YjsActions)
 * - Selectors = queries/derived data (YjsSelectors)
 */

/**
 * Constants for rotation detection
 */
const EXHAUST_ROTATION = 90;
const ROTATION_EPSILON = 0.1;

/**
 * Get IDs of all objects selected by the current actor.
 *
 * @param store - The YjsStore instance
 * @returns Array of object IDs that are selected by the current actor
 */
export function getSelectedObjectIds(store: YjsStore): string[] {
  const selectedIds: string[] = [];
  const allObjects = store.getAllObjects();
  const actorId = store.getActorId();

  for (const [id, obj] of allObjects.entries()) {
    if (obj._selectedBy === actorId) {
      selectedIds.push(id);
    }
  }

  return selectedIds;
}

/**
 * Check if all currently selected stacks are exhausted (rotated 90 degrees).
 * Non-stack objects are ignored.
 *
 * @param store - The YjsStore instance
 * @returns True if all selected stacks are exhausted (and at least one stack exists)
 *
 * @example
 * if (areAllSelectedStacksExhausted(store)) {
 *   console.log('All selected stacks are exhausted');
 * }
 */
export function areAllSelectedStacksExhausted(store: YjsStore): boolean {
  const selectedIds = getSelectedObjectIds(store);
  const stacks = selectedIds
    .map((id) => store.getObject(id))
    .filter((obj): obj is NonNullable<typeof obj> => obj !== null)
    .filter((obj) => obj._kind === ObjectKind.Stack);

  if (stacks.length === 0) return false;

  return stacks.every(
    (obj) => Math.abs(obj._pos.r - EXHAUST_ROTATION) < ROTATION_EPSILON,
  );
}

/**
 * Check if all currently selected stacks are ready (not exhausted, rotation near 0).
 * Non-stack objects are ignored.
 *
 * @param store - The YjsStore instance
 * @returns True if all selected stacks are ready (and at least one stack exists)
 *
 * @example
 * if (areAllSelectedStacksReady(store)) {
 *   console.log('All selected stacks are ready');
 * }
 */
export function areAllSelectedStacksReady(store: YjsStore): boolean {
  const selectedIds = getSelectedObjectIds(store);
  const stacks = selectedIds
    .map((id) => store.getObject(id))
    .filter((obj): obj is NonNullable<typeof obj> => obj !== null)
    .filter((obj) => obj._kind === ObjectKind.Stack);

  if (stacks.length === 0) return false;

  return stacks.every(
    (obj) => Math.abs(obj._pos.r - EXHAUST_ROTATION) >= ROTATION_EPSILON,
  );
}
