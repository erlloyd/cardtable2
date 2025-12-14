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
 * Get IDs of all objects selected by the current actor (M3.6-T3).
 *
 * Refactored to work with Y.Maps directly - zero allocations.
 *
 * @param store - The YjsStore instance
 * @returns Array of object IDs that are selected by the current actor
 */
export function getSelectedObjectIds(store: YjsStore): string[] {
  const selectedIds: string[] = [];
  const actorId = store.getActorId();

  // Work with Y.Maps directly - no .toJSON() conversion
  store.forEachObject((yMap, id) => {
    const selectedBy = yMap.get('_selectedBy');
    if (selectedBy === actorId) {
      selectedIds.push(id);
    }
  });

  return selectedIds;
}

/**
 * Check if all currently selected stacks are exhausted (rotated 90 degrees) (M3.6-T3).
 * Non-stack objects are ignored.
 *
 * Refactored to work with Y.Maps directly - zero allocations.
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
  let stackCount = 0;
  let allExhausted = true;

  // Work with Y.Maps directly - no .toJSON() conversion
  for (const id of selectedIds) {
    const yMap = store.getObjectYMap(id);
    if (!yMap) continue;

    const kind = yMap.get('_kind');
    if (kind !== ObjectKind.Stack) continue;

    stackCount++;
    const pos = yMap.get('_pos');
    if (pos && Math.abs(pos.r - EXHAUST_ROTATION) >= ROTATION_EPSILON) {
      allExhausted = false;
      break;
    }
  }

  return stackCount > 0 && allExhausted;
}

/**
 * Check if all currently selected stacks are ready (not exhausted, rotation near 0) (M3.6-T3).
 * Non-stack objects are ignored.
 *
 * Refactored to work with Y.Maps directly - zero allocations.
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
  let stackCount = 0;
  let allReady = true;

  // Work with Y.Maps directly - no .toJSON() conversion
  for (const id of selectedIds) {
    const yMap = store.getObjectYMap(id);
    if (!yMap) continue;

    const kind = yMap.get('_kind');
    if (kind !== ObjectKind.Stack) continue;

    stackCount++;
    const pos = yMap.get('_pos');
    if (pos && Math.abs(pos.r - EXHAUST_ROTATION) < ROTATION_EPSILON) {
      allReady = false;
      break;
    }
  }

  return stackCount > 0 && allReady;
}
