import type { YjsStore } from './YjsStore';

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
