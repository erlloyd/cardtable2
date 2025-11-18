import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { YjsStore } from '../store/YjsStore';
import { createObject, clearAllSelections } from '../store/YjsActions';
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

  // Handler to clear all objects (M3-T2.5 Phase 7)
  const handleClearStore = () => {
    if (!storeRef.current) return;

    storeRef.current.clearAllObjects();
    console.log('[Table] Cleared all objects from store');
  };

  // Handler to clear all selections (M3-T3)
  const handleClearSelections = () => {
    if (!storeRef.current) return;

    const cleared = clearAllSelections(storeRef.current);
    console.log(`[Table] Cleared ${cleared} selection(s)`);
  };

  // Handler to reset to test scene (M3-T2.5 Phase 7)
  const handleResetToTestScene = () => {
    if (!storeRef.current) return;

    // Clear existing objects
    storeRef.current.clearAllObjects();

    const colors = [
      0x6c5ce7, // Purple
      0x00b894, // Green
      0xfdcb6e, // Yellow
      0xe17055, // Red
      0x74b9ff, // Blue
    ];

    // Create 5 stacks (cards) - top left area
    for (let i = 0; i < 5; i++) {
      createObject(storeRef.current, {
        kind: ObjectKind.Stack,
        pos: { x: -300 + i * 80, y: -200, r: 0 },
        cards: [`test-card-${i + 1}`],
        faceUp: true,
        meta: { color: colors[i % colors.length] },
      });
    }

    // Create 3 tokens - top right area
    for (let i = 0; i < 3; i++) {
      createObject(storeRef.current, {
        kind: ObjectKind.Token,
        pos: { x: 150 + i * 100, y: -200, r: 0 },
        meta: {
          size: 40,
          color: colors[(i + 1) % colors.length],
        },
      });
    }

    // Create 2 zones - middle area
    for (let i = 0; i < 2; i++) {
      createObject(storeRef.current, {
        kind: ObjectKind.Zone,
        pos: { x: -150 + i * 350, y: 0, r: 0 },
        meta: {
          width: 300,
          height: 200,
          color: colors[(i + 2) % colors.length],
        },
      });
    }

    // Create 3 mats - bottom left area
    for (let i = 0; i < 3; i++) {
      createObject(storeRef.current, {
        kind: ObjectKind.Mat,
        pos: { x: -250 + i * 100, y: 200, r: 0 },
        meta: {
          size: 50,
          color: colors[(i + 3) % colors.length],
        },
      });
    }

    // Create 2 counters - bottom right area
    for (let i = 0; i < 2; i++) {
      createObject(storeRef.current, {
        kind: ObjectKind.Counter,
        pos: { x: 150 + i * 120, y: 200, r: 0 },
        meta: {
          size: 45,
          color: colors[(i + 4) % colors.length],
        },
      });
    }

    console.log(
      '[Table] Reset to test scene: 5 stacks, 3 tokens, 2 zones, 3 mats, 2 counters',
    );
  };

  // Initialize Yjs store on mount (M3-T1)
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (storeRef.current) {
      return;
    }

    console.log(`[Table] Initializing YjsStore for table: ${id}`);

    // WebSocket server URL (M5-T1)
    // In development: connect to local server
    // In production: use env var or leave undefined for offline mode
    const wsUrl: string =
      (import.meta.env.VITE_WS_URL as string | undefined) ||
      'ws://localhost:3001?room=' + id;

    const store = new YjsStore(id, wsUrl);
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
        const unsubscribe = store.onObjectsChange((changes) => {
          // Update object count based on current state
          const updatedObjects = store.getAllObjects();
          setObjectCount(updatedObjects.size);

          // Log changes for debugging
          if (changes.added.length > 0) {
            console.log(`[Table] Added ${changes.added.length} object(s)`);
          }
          if (changes.updated.length > 0) {
            console.log(`[Table] Updated ${changes.updated.length} object(s)`);
          }
          if (changes.removed.length > 0) {
            console.log(`[Table] Removed ${changes.removed.length} object(s)`);
          }
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
        <button
          onClick={handleResetToTestScene}
          disabled={!isStoreReady}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: isStoreReady ? '#3498db' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isStoreReady ? 'pointer' : 'not-allowed',
          }}
        >
          Reset to Test Scene
        </button>
        <button
          onClick={handleClearStore}
          disabled={!isStoreReady}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: isStoreReady ? '#e74c3c' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isStoreReady ? 'pointer' : 'not-allowed',
          }}
        >
          Clear Store
        </button>
        <button
          onClick={handleClearSelections}
          disabled={!isStoreReady}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: isStoreReady ? '#f39c12' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isStoreReady ? 'pointer' : 'not-allowed',
          }}
        >
          Clear Selections
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
