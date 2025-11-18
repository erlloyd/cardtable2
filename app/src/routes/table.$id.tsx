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

  // Awareness simulation state (M3-T4 testing)
  const [isSimulatingCursor, setIsSimulatingCursor] = useState(false);
  const [isSimulatingDrag, setIsSimulatingDrag] = useState(false);
  const cursorSimulationIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const dragSimulationIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const fakeClientId = 999999; // Fake client ID for simulation

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

  // Handler to simulate remote cursor (M3-T4 testing)
  const handleToggleSimulateCursor = () => {
    if (!storeRef.current) return;

    if (isSimulatingCursor) {
      // Stop simulation
      if (cursorSimulationIntervalRef.current) {
        clearInterval(cursorSimulationIntervalRef.current);
        cursorSimulationIntervalRef.current = null;
      }
      // Remove fake client from awareness
      storeRef.current.awareness.states.delete(fakeClientId);
      storeRef.current.awareness.meta.delete(fakeClientId);
      storeRef.current.awareness.emit('change', [
        { added: [], updated: [], removed: [fakeClientId] },
      ]);
      setIsSimulatingCursor(false);
      console.log('[Table] Stopped simulating remote cursor');
    } else {
      // Start simulation - move cursor in a circle
      let angle = 0;
      cursorSimulationIntervalRef.current = setInterval(() => {
        if (!storeRef.current) return;

        const radius = 200;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        angle += 0.1;

        // Manually set awareness state for fake client
        storeRef.current.awareness.states.set(fakeClientId, {
          actorId: 'fake-actor-alice',
          cursor: { x, y },
        });
        storeRef.current.awareness.meta.set(fakeClientId, {
          clock: Date.now(),
          lastUpdated: Date.now(),
        });
        storeRef.current.awareness.emit('change', [
          { added: [], updated: [fakeClientId], removed: [] },
        ]);
      }, 33); // 30Hz updates

      setIsSimulatingCursor(true);
      console.log('[Table] Started simulating remote cursor');
    }
  };

  // Handler to simulate remote drag (M3-T4 testing)
  const handleToggleSimulateDrag = () => {
    if (!storeRef.current) return;

    if (isSimulatingDrag) {
      // Stop simulation
      if (dragSimulationIntervalRef.current) {
        clearInterval(dragSimulationIntervalRef.current);
        dragSimulationIntervalRef.current = null;
      }
      // Remove fake client from awareness
      storeRef.current.awareness.states.delete(fakeClientId);
      storeRef.current.awareness.meta.delete(fakeClientId);
      storeRef.current.awareness.emit('change', [
        { added: [], updated: [], removed: [fakeClientId] },
      ]);
      setIsSimulatingDrag(false);
      console.log('[Table] Stopped simulating remote drag');
    } else {
      // Start simulation - drag in a line
      let offset = 0;
      const startX = -300;
      const startY = 0;

      dragSimulationIntervalRef.current = setInterval(() => {
        if (!storeRef.current) return;

        // Get first object from store to simulate dragging it
        const objects = storeRef.current.getAllObjects();
        const firstObjectId =
          objects.size > 0 ? Array.from(objects.keys())[0] : 'fake-object';

        const x = startX + offset;
        const y = startY + Math.sin(offset / 50) * 50; // Sine wave movement
        offset += 5;

        if (offset > 600) {
          offset = 0; // Loop back
        }

        // Manually set awareness state for fake client with drag
        storeRef.current.awareness.states.set(fakeClientId, {
          actorId: 'fake-actor-bob',
          drag: {
            gid: 'fake-gesture-123',
            ids: [firstObjectId],
            pos: { x, y, r: 0 },
            ts: Date.now(),
          },
        });
        storeRef.current.awareness.meta.set(fakeClientId, {
          clock: Date.now(),
          lastUpdated: Date.now(),
        });
        storeRef.current.awareness.emit('change', [
          { added: [], updated: [fakeClientId], removed: [] },
        ]);
      }, 33); // 30Hz updates

      setIsSimulatingDrag(true);
      console.log('[Table] Started simulating remote drag');
    }
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
      // Stop any running simulations
      if (cursorSimulationIntervalRef.current) {
        clearInterval(cursorSimulationIntervalRef.current);
        cursorSimulationIntervalRef.current = null;
      }
      if (dragSimulationIntervalRef.current) {
        clearInterval(dragSimulationIntervalRef.current);
        dragSimulationIntervalRef.current = null;
      }

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
        <div
          style={{
            borderLeft: '1px solid #4a5568',
            height: '24px',
            margin: '0 4px',
          }}
        />
        <button
          onClick={handleToggleSimulateCursor}
          disabled={!isStoreReady}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: isStoreReady
              ? isSimulatingCursor
                ? '#e74c3c'
                : '#9b59b6'
              : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isStoreReady ? 'pointer' : 'not-allowed',
          }}
        >
          {isSimulatingCursor ? '⏸ Stop Cursor' : '▶ Simulate Cursor'}
        </button>
        <button
          onClick={handleToggleSimulateDrag}
          disabled={!isStoreReady || isSimulatingCursor}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: isStoreReady
              ? isSimulatingDrag
                ? '#e74c3c'
                : '#8e44ad'
              : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor:
              isStoreReady && !isSimulatingCursor ? 'pointer' : 'not-allowed',
          }}
        >
          {isSimulatingDrag ? '⏸ Stop Drag' : '▶ Simulate Drag'}
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
