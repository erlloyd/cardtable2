import type { YjsStore } from '../store/YjsStore';
import type { ActionContext } from './types';
import { ObjectKind, type TableObject } from '@cardtable2/shared';

/**
 * Build ActionContext from current store state and selection IDs.
 *
 * This is a domain model builder that transforms raw Yjs store data
 * into the structured ActionContext format required by the action system.
 *
 * Used by table routes (table.$id.tsx and dev.table.$id.tsx) to provide
 * context for ActionHandle and KeyboardManager.
 *
 * @param store - The Yjs store instance
 * @param selectedIds - Array of selected object IDs (from selectionState)
 * @param selectedObjects - Array of selected TableObject instances (from selectionState)
 * @returns ActionContext or null if store is not available
 */
export function buildActionContext(
  store: YjsStore | null,
  selectedIds: string[],
  selectedObjects: TableObject[],
): ActionContext | null {
  if (!store) return null;

  const kinds = new Set(selectedObjects.map((obj) => obj._kind));

  return {
    store,
    selection: {
      ids: selectedIds,
      objects: selectedObjects,
      count: selectedIds.length,
      hasStacks: kinds.has(ObjectKind.Stack),
      hasTokens: kinds.has(ObjectKind.Token),
      hasMixed: kinds.size > 1,
      allLocked: selectedObjects.every((obj) => obj._meta?.locked === true),
      allUnlocked: selectedObjects.every((obj) => obj._meta?.locked !== true),
      canAct: true, // All selected by this actor
    },
    actorId: store.getActorId(),
  };
}
