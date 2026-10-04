import { useEffect } from 'react';
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
  useEffect(() => {
    // Only subscribe after renderer is initialized and synced
    if (!isSynced || !renderer) {
      return;
    }

    console.log('[useAwarenessSync] Subscribing to awareness changes');

    const unsubscribe = store.onAwarenessChange((states) => {
      // Filter out local client (only send remote awareness)
      const localClientId = store.getDoc().clientID;
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

    return () => {
      console.log('[useAwarenessSync] Unsubscribing from awareness changes');
      unsubscribe();
    };
  }, [isSynced, renderer, store]);
}
