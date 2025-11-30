import { useEffect, useRef } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore } from '../store/YjsStore';
import type { AwarenessState } from '@cardtable2/shared';

/**
 * Hook for synchronizing awareness changes to renderer
 *
 * Subscribes to store.onAwarenessChange() and forwards remote awareness updates to renderer.
 * Filters out local client awareness (only sends remote awareness).
 * Only activates when both renderer and isSynced are ready.
 *
 * @param renderer - Renderer instance
 * @param store - Yjs store instance
 * @param isSynced - Whether initial sync is complete
 */
export function useAwarenessSync(
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

    console.log('[useAwarenessSync] Subscribing to awareness changes');

    const unsubscribe = storeRef.current.onAwarenessChange((states) => {
      // Filter out local client (only send remote awareness)
      const localClientId = storeRef.current.getDoc().clientID;
      const remoteStates: Array<{ clientId: number; state: AwarenessState }> =
        [];

      states.forEach((state, clientId) => {
        if (clientId !== localClientId) {
          remoteStates.push({ clientId, state });
        }
      });

      // Forward to renderer
      renderer.sendMessage({
        type: 'awareness-update',
        states: remoteStates,
      });
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        console.log('[useAwarenessSync] Unsubscribing from awareness changes');
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isSynced, renderer]);
}
