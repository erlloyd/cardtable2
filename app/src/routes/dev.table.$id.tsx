import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { YjsStore } from '../store/YjsStore';
import { createObject, clearAllSelections } from '../store/YjsActions';
import { ObjectKind } from '@cardtable2/shared';
import { useTableStore } from '../hooks/useTableStore';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

export const Route = createFileRoute('/dev/table/$id')({
  component: DevTable,
});

function DevTable() {
  const { id } = Route.useParams();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [objectCount, setObjectCount] = useState(0);

  // Set up object change subscription when store is ready
  const handleStoreReady = useCallback((store: YjsStore) => {
    // Get initial object count
    const objects = store.getAllObjects();
    setObjectCount(objects.size);
    console.log(`[DevTable] Loaded ${objects.size} objects from IndexedDB`);

    // Subscribe to object changes
    const unsubscribe = store.onObjectsChange((changes) => {
      // Update object count based on current state
      const updatedObjects = store.getAllObjects();
      setObjectCount(updatedObjects.size);

      // Log changes for debugging
      if (changes.added.length > 0) {
        console.log(`[DevTable] Added ${changes.added.length} object(s)`);
      }
      if (changes.updated.length > 0) {
        console.log(`[DevTable] Updated ${changes.updated.length} object(s)`);
      }
      if (changes.removed.length > 0) {
        console.log(`[DevTable] Removed ${changes.removed.length} object(s)`);
      }
    });

    // Store unsubscribe function for cleanup
    unsubscribeRef.current = unsubscribe;

    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  const { store, isStoreReady, connectionStatus } = useTableStore({
    tableId: id,
    logPrefix: 'DevTable',
    onStoreReady: handleStoreReady,
  });

  // Handler to spawn a test card (M3-T2 testing)
  const handleSpawnCard = () => {
    if (!store) return;

    // Spawn at random position near center
    const x = Math.random() * 400 - 200; // -200 to +200
    const y = Math.random() * 400 - 200;

    const objectId = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x, y, r: 0 },
      cards: ['test-card'],
      faceUp: true,
    });

    console.log(
      `[DevTable] Spawned card at (${x.toFixed(0)}, ${y.toFixed(0)}), id: ${objectId}`,
    );
  };

  // Handler to clear all objects (M3-T2.5 Phase 7)
  const handleClearStore = () => {
    if (!store) return;

    store.clearAllObjects();
    console.log('[DevTable] Cleared all objects from store');
  };

  // Handler to clear all selections (M3-T3)
  const handleClearSelections = () => {
    if (!store) return;

    const cleared = clearAllSelections(store);
    console.log(`[DevTable] Cleared ${cleared} selection(s)`);
  };

  // Handler to reset to test scene (M3-T2.5 Phase 7)
  const handleResetToTestScene = () => {
    if (!store) return;

    // Clear existing objects
    store.clearAllObjects();

    const colors = [
      0x6c5ce7, // Purple
      0x00b894, // Green
      0xfdcb6e, // Yellow
      0xe17055, // Red
      0x74b9ff, // Blue
    ];

    // Create 5 stacks (cards) - top left area
    for (let i = 0; i < 5; i++) {
      createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: -300 + i * 80, y: -200, r: 0 },
        cards: [`test-card-${i + 1}`],
        faceUp: true,
        meta: { color: colors[i % colors.length] },
      });
    }

    // Create 3 tokens - top right area
    for (let i = 0; i < 3; i++) {
      createObject(store, {
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
      createObject(store, {
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
      createObject(store, {
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
      createObject(store, {
        kind: ObjectKind.Counter,
        pos: { x: 150 + i * 120, y: 200, r: 0 },
        meta: {
          size: 45,
          color: colors[(i + 4) % colors.length],
        },
      });
    }

    console.log(
      '[DevTable] Reset to test scene: 5 stacks, 3 tokens, 2 zones, 3 mats, 2 counters',
    );
  };

  return (
    <div className="dev-table">
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
        {store && isStoreReady ? (
          <Board
            tableId={id}
            store={store}
            connectionStatus={connectionStatus}
            showDebugUI={true}
          />
        ) : (
          <div>Initializing table state...</div>
        )}
      </Suspense>
    </div>
  );
}
