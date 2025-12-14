import type { YjsStore } from '../store/YjsStore';
import type { ActionContext } from './types';
import { ObjectKind } from '@cardtable2/shared';
import type { TableObjectYMap } from '../store/types';

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
 * @param selectedYMaps - Array of selected Y.Map references (no conversion needed)
 * @param navigate - Optional navigation function for route-based actions
 * @param currentRoute - Optional current route path
 * @returns ActionContext or null if store is not available
 */
export function buildActionContext(
  store: YjsStore | null,
  selectedYMaps: TableObjectYMap[],
  navigate?: (path: string) => void,
  currentRoute?: string,
): ActionContext | null {
  if (!store) return null;

  // Extract IDs and analyze selection by working with Y.Maps directly
  const kinds = new Set<ObjectKind>();
  const selectedIds: string[] = [];
  let allLocked = true;
  let allUnlocked = true;

  // Work with Y.Maps directly - no .toJSON() conversion
  store.forEachObject((yMap, id) => {
    // Check if this Y.Map is in the selected set
    if (selectedYMaps.includes(yMap)) {
      selectedIds.push(id);
      const kind = yMap.get('_kind');
      if (kind) kinds.add(kind);

      const meta = yMap.get('_meta');
      const locked = meta?.locked === true;
      if (!locked) allLocked = false;
      if (locked) allUnlocked = false;
    }
  });

  return {
    store,
    selection: {
      ids: selectedIds,
      yMaps: selectedYMaps,
      count: selectedYMaps.length,
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
  };
}
