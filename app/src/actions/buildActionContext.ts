import type { YjsStore } from '../store/YjsStore';
import type { ActionContext } from './types';
import { ObjectKind } from '@cardtable2/shared';
import type { TableObjectYMap } from '../store/types';
import type { GameAssets } from '../content';

/**
 * Build ActionContext from current store state and selection (M3.6-T4).
 *
 * Refactored to work with Y.Maps directly - zero allocations.
 *
 * This is a domain model builder that transforms raw Yjs store data
 * into the structured ActionContext format required by the action system.
 *
 * Used by table routes (table.$id.tsx and dev.table.$id.tsx) to provide
 * context for ActionHandle and KeyboardManager.
 *
 * @param store - The Yjs store instance
 * @param selectedObjects - Array of {id, yMap} pairs for selected objects
 * @param navigate - Optional navigation function for route-based actions
 * @param currentRoute - Optional current route path
 * @param gridSnapEnabled - Optional grid snap enabled state
 * @param onGridSnapEnabledChange - Optional grid snap toggle callback
 * @param setGameAssets - Optional callback to set game assets for scenario loading
 * @returns ActionContext or null if store is not available
 */
export function buildActionContext(
  store: YjsStore | null,
  selectedObjects: Array<{ id: string; yMap: TableObjectYMap }>,
  navigate?: (path: string) => void,
  currentRoute?: string,
  gridSnapEnabled?: boolean,
  onGridSnapEnabledChange?: (enabled: boolean) => void,
  setGameAssets?: (assets: GameAssets) => void,
): ActionContext | null {
  if (!store) return null;

  // Extract IDs and analyze selection by working with Y.Maps directly
  const kinds = new Set<ObjectKind>();
  const selectedIds: string[] = [];
  const selectedYMaps: TableObjectYMap[] = [];
  let allLocked = true;
  let allUnlocked = true;

  // Iterate over selected objects directly (O(m) instead of O(n*m))
  for (const { id, yMap } of selectedObjects) {
    selectedIds.push(id);
    selectedYMaps.push(yMap);

    const kind = yMap.get('_kind');
    if (kind) kinds.add(kind);

    const locked = yMap.get('_locked') === true;
    if (!locked) allLocked = false;
    if (locked) allUnlocked = false;
  }

  return {
    store,
    selection: {
      ids: selectedIds,
      yMaps: selectedYMaps,
      count: selectedObjects.length,
      hasStacks: kinds.has(ObjectKind.Stack),
      hasTokens: kinds.has(ObjectKind.Token),
      hasMixed: kinds.size > 1,
      allLocked,
      allUnlocked,
      canAct: true, // All selected by this actor
    },
    actorId: store.getActorId(),
    navigate,
    currentRoute,
    gridSnapEnabled,
    onGridSnapEnabledChange,
    setGameAssets,
  };
}
