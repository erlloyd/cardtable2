import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { YjsStore } from '../store/YjsStore';
import { createObject } from '../store/YjsActions';
import { ObjectKind } from '@cardtable2/shared';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

export const Route = createFileRoute('/table/$id')({
  component: Table,
});

function Table() {
  const { id } = Route.useParams();
  const storeRef = useRef<YjsStore | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [isStoreReady, setIsStoreReady] = useState(false);
  const [objectCount, setObjectCount] = useState(0);

  // Handler to spawn a test card (M3-T2 testing)
  const handleSpawnCard = () => {
    if (!storeRef.current) return;

    // Spawn at random position near center
    const x = Math.random() * 400 - 200; // -200 to +200
    const y = Math.random() * 400 - 200;

    const id = createObject(storeRef.current, {
      kind: ObjectKind.Stack,
      pos: { x, y, r: 0 },
      cards: ['test-card'],
      faceUp: true,
    });

    console.log(
      `[Table] Spawned card at (${x.toFixed(0)}, ${y.toFixed(0)}), id: ${id}`,
    );
  };

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
        // Check if this store is still the current one (not destroyed by cleanup)
        if (storeRef.current !== store) {
          return;
        }

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
        unsubscribeRef.current = unsubscribe;
      })
      .catch((error) => {
        console.error('[Table] Failed to initialize YjsStore:', error);
      });

    // Cleanup on unmount
    return () => {
      // Unsubscribe from object changes
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Destroy store
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
      {/* Store status display and test controls */}
      <div
        style={{
          fontSize: '12px',
          padding: '8px',
          marginBottom: '8px',
          backgroundColor: '#2d3748',
          color: '#ffffff',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          Store: {isStoreReady ? '✓ Ready' : '⏳ Loading...'} | Objects:{' '}
          {objectCount}
        </div>
        <button
          onClick={handleSpawnCard}
          disabled={!isStoreReady}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: isStoreReady ? '#4CAF50' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isStoreReady ? 'pointer' : 'not-allowed',
          }}
        >
          Spawn Card
        </button>
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
