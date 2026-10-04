import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { YjsStore } from '../store/YjsStore';
import { getWSUrl } from '../utils/backend';

interface UseTableStoreOptions {
  tableId: string;
}

interface UseTableStoreReturn {
  store: YjsStore;
  isStoreReady: boolean;
  connectionStatus: string;
}

/**
 * Creates a YjsStore for a table and ties its connection to the component's
 * lifetime. The store is created once per mount (its constructor holds no
 * external resources); routes remount on tableId change via `remountDeps`.
 *
 * @param options.tableId - The table ID to initialize the store with
 */
export function useTableStore({
  tableId,
}: UseTableStoreOptions): UseTableStoreReturn {
  // WebSocket server URL (M5-T1)
  // In development: connect to server using current hostname (works for mobile on LAN)
  // In production: use env var or leave undefined for offline mode
  const [store] = useState(() => new YjsStore(tableId, getWSUrl()));

  useEffect(() => {
    store.connect();

    // Expose store globally for E2E testing (development and E2E mode only)
    if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
      window.__TEST_STORE__ = store;
    }

    return () => {
      store.disconnect();

      if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
        delete window.__TEST_STORE__;
      }
    };
  }, [store]);

  const subscribeReady = useCallback(
    (onChange: () => void) => store.onReadyChange(onChange),
    [store],
  );
  const getReady = useCallback(() => store.isReady(), [store]);
  const isStoreReady = useSyncExternalStore(subscribeReady, getReady);

  const subscribeStatus = useCallback(
    (onChange: () => void) => store.onConnectionStatusChange(onChange),
    [store],
  );
  const getStatus = useCallback(() => store.getConnectionStatus(), [store]);
  const connectionStatus = useSyncExternalStore(subscribeStatus, getStatus);

  return { store, isStoreReady, connectionStatus };
}
