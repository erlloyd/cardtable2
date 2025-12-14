import { useEffect, useRef } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore, ObjectChanges } from '../store/YjsStore';

/**
 * Hook for synchronizing store changes to renderer (M3.6-T5)
 *
 * Subscribes to store.onObjectsChange() and forwards added/updated/removed objects to renderer.
 * Only activates when both renderer and isSynced are ready.
 *
 * PERFORMANCE NOTE:
 * - Y.Maps must be converted to plain objects via .toJSON() at the worker boundary
 * - This happens on every object add/update (e.g., 500 conversions at drag end)
 * - This is LESS FREQUENT than the old hot path we eliminated:
 *   * OLD: Selection queries at 30Hz during drag = 15,000 conversions/sec
 *   * NEW: Sync at drag end = 500 conversions once
 * - The real performance win is eliminating .toJSON() from:
 *   * Selection queries (getObjectsSelectedBy)
 *   * Action context building (buildActionContext)
 *   * Selector execution (areAllSelectedStacksExhausted, etc.)
 *   * Route state updates
 *
 * FUTURE OPTIMIZATION:
 * - Could eliminate redundant sync-back: renderer already has correct positions after drag
 * - Could use incremental position-only updates instead of full object sync
 * - Main-thread rendering mode could pass Y.Map references directly (no serialization)
 *
 * @param renderer - Renderer instance
 * @param store - Yjs store instance
 * @param isSynced - Whether initial sync is complete
 */
export function useStoreSync(
  renderer: IRendererAdapter | null,
  store: YjsStore,
  isSynced: boolean,
): void {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const storeRef = useRef<YjsStore>(store);

  // Keep store ref up to date
  storeRef.current = store;

  useEffect(() => {
    // Only subscribe after renderer is initialized and synced
    if (!isSynced || !renderer) {
      return;
    }

    console.log('[useStoreSync] Subscribing to store changes');

    const unsubscribe = storeRef.current.onObjectsChange(
      (changes: ObjectChanges) => {
        // Forward added objects (batched) (M3.6-T5)
        // Convert Y.Maps to plain objects for worker serialization
        if (changes.added.length > 0) {
          console.log(
            `[useStoreSync] Forwarding ${changes.added.length} added object(s)`,
          );
          renderer.sendMessage({
            type: 'objects-added',
            objects: changes.added.map(({ id, yMap }) => ({
              id,
              obj: yMap.toJSON(),
            })),
          });
        }

        // Forward updated objects (batched) (M3.6-T5)
        // Convert Y.Maps to plain objects for worker serialization
        if (changes.updated.length > 0) {
          console.log(
            `[useStoreSync] Forwarding ${changes.updated.length} updated object(s)`,
          );
          renderer.sendMessage({
            type: 'objects-updated',
            objects: changes.updated.map(({ id, yMap }) => ({
              id,
              obj: yMap.toJSON(),
            })),
          });
        }

        // Forward removed objects (batched)
        if (changes.removed.length > 0) {
          console.log(
            `[useStoreSync] Forwarding ${changes.removed.length} removed object(s)`,
          );
          renderer.sendMessage({
            type: 'objects-removed',
            ids: changes.removed,
          });
        }
      },
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        console.log('[useStoreSync] Unsubscribing from store changes');
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isSynced, renderer]);
}
