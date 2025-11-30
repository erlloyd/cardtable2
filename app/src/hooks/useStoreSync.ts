import { useEffect, useRef } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore, ObjectChanges } from '../store/YjsStore';

/**
 * Hook for synchronizing store changes to renderer
 *
 * Subscribes to store.onObjectsChange() and forwards added/updated/removed objects to renderer.
 * Only activates when both renderer and isSynced are ready.
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
        // Forward added objects (batched)
        if (changes.added.length > 0) {
          console.log(
            `[useStoreSync] Forwarding ${changes.added.length} added object(s)`,
          );
          renderer.sendMessage({
            type: 'objects-added',
            objects: changes.added,
          });
        }

        // Forward updated objects (batched)
        if (changes.updated.length > 0) {
          console.log(
            `[useStoreSync] Forwarding ${changes.updated.length} updated object(s)`,
          );
          renderer.sendMessage({
            type: 'objects-updated',
            objects: changes.updated,
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
