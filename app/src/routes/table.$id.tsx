import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { YjsStore } from '../store/YjsStore';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

export const Route = createFileRoute('/table/$id')({
  component: Table,
});

function Table() {
  const { id } = Route.useParams();
  const storeRef = useRef<YjsStore | null>(null);
  const [isStoreReady, setIsStoreReady] = useState(false);
  const [objectCount, setObjectCount] = useState(0);

  // Initialize Yjs store on mount (M3-T1)
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (storeRef.current) {
      return;
    }

    console.log(`[Table] Initializing YjsStore for table: ${id}`);
    const store = new YjsStore(id);
    storeRef.current = store;

    // Expose store globally for E2E testing (development only)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      window.__TEST_STORE__ = store;
    }

    // Wait for store to load state from IndexedDB
    void store
      .waitForReady()
      .then(() => {
        console.log('[Table] YjsStore ready');
        setIsStoreReady(true);

        // Get initial object count
        const objects = store.getAllObjects();
        setObjectCount(objects.size);
        console.log(`[Table] Loaded ${objects.size} objects from IndexedDB`);

        // Subscribe to object changes
        const unsubscribe = store.onObjectsChange(() => {
          const updatedObjects = store.getAllObjects();
          setObjectCount(updatedObjects.size);
        });

        // Store unsubscribe function for cleanup
        return unsubscribe;
      })
      .catch((error) => {
        console.error('[Table] Failed to initialize YjsStore:', error);
      });

    // Cleanup on unmount
    return () => {
      if (storeRef.current) {
        storeRef.current.destroy();
        storeRef.current = null;
      }
      setIsStoreReady(false);

      // Clean up global test reference
      if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
        delete window.__TEST_STORE__;
      }
    };
  }, [id]);

  return (
    <div className="table">
      {/* Store status display */}
      <div
        style={{
          fontSize: '12px',
          padding: '8px',
          marginBottom: '8px',
          backgroundColor: '#f0f0f0',
          borderRadius: '4px',
        }}
      >
        Store: {isStoreReady ? '✓ Ready' : '⏳ Loading...'} | Objects:{' '}
        {objectCount}
      </div>

      <Suspense fallback={<div>Loading board...</div>}>
        {storeRef.current && isStoreReady ? (
          <Board tableId={id} store={storeRef.current} />
        ) : (
          <div>Initializing table state...</div>
        )}
      </Suspense>
    </div>
  );
}
