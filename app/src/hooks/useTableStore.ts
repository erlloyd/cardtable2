import { useEffect, useRef, useState } from 'react';
import { YjsStore } from '../store/YjsStore';

interface UseTableStoreOptions {
  tableId: string;
  logPrefix?: string;
  onStoreReady?: (store: YjsStore) => void;
}

interface UseTableStoreReturn {
  store: YjsStore | null;
  isStoreReady: boolean;
  connectionStatus: string;
}

/**
 * Custom hook for initializing and managing a YjsStore instance
 * Handles store lifecycle, connection status, and cleanup
 *
 * @param options - Configuration options
 * @param options.tableId - The table ID to initialize the store with
 * @param options.logPrefix - Prefix for console logs (default: 'Table')
 * @param options.onStoreReady - Optional callback when store is ready
 */
export function useTableStore({
  tableId,
  logPrefix = 'Table',
  onStoreReady,
}: UseTableStoreOptions): UseTableStoreReturn {
  const storeRef = useRef<YjsStore | null>(null);
  const connectionStatusUnsubscribeRef = useRef<(() => void) | null>(null);
  const onStoreReadyRef = useRef(onStoreReady);
  const [isStoreReady, setIsStoreReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('offline');

  // Keep onStoreReady callback ref up to date
  useEffect(() => {
    onStoreReadyRef.current = onStoreReady;
  }, [onStoreReady]);

  // Initialize Yjs store on mount
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (storeRef.current) {
      return;
    }

    console.log(`[${logPrefix}] Initializing YjsStore for table: ${tableId}`);

    // WebSocket server URL (M5-T1)
    // In development: connect to server using current hostname (works for mobile on LAN)
    // In production: use env var or leave undefined for offline mode
    const wsUrl: string =
      (import.meta.env.VITE_WS_URL as string | undefined) ||
      `ws://${window.location.hostname}:3001`;

    const store = new YjsStore(tableId, wsUrl);
    storeRef.current = store;

    // Subscribe to connection status changes (M5-T1)
    const connectionStatusUnsubscribe = store.onConnectionStatusChange(
      (status) => {
        setConnectionStatus(status);
        console.log(`[${logPrefix}] Connection status: ${status}`);
      },
    );
    connectionStatusUnsubscribeRef.current = connectionStatusUnsubscribe;

    // Expose store globally for E2E testing (development and E2E mode only)
    if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
      window.__TEST_STORE__ = store;
    }

    // Wait for store to load state from IndexedDB
    void store
      .waitForReady()
      .then(() => {
        // Check if this store is still the current one (not destroyed by cleanup)
        if (storeRef.current !== store) {
          return;
        }

        console.log(`[${logPrefix}] YjsStore ready`);
        setIsStoreReady(true);

        // Call optional ready callback
        if (onStoreReadyRef.current) {
          onStoreReadyRef.current(store);
        }

        console.log(`[${logPrefix}] YjsStore loaded and ready`);
      })
      .catch((error) => {
        console.error(`[${logPrefix}] Failed to initialize YjsStore:`, error);
      });

    // Cleanup on unmount
    return () => {
      // Unsubscribe from connection status changes
      if (connectionStatusUnsubscribeRef.current) {
        connectionStatusUnsubscribeRef.current();
        connectionStatusUnsubscribeRef.current = null;
      }

      // Destroy store
      if (storeRef.current) {
        storeRef.current.destroy();
        storeRef.current = null;
      }
      setIsStoreReady(false);

      // Clean up global test reference
      if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
        delete window.__TEST_STORE__;
      }
    };
  }, [tableId, logPrefix]);

  return {
    store: storeRef.current,
    isStoreReady,
    connectionStatus,
  };
}
