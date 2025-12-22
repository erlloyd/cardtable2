import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { YjsStore } from '../store/YjsStore';
import {
  createObject,
  clearAllSelections,
  resetToTestScene,
} from '../store/YjsActions';
import { ObjectKind } from '@cardtable2/shared';
import { useTableStore } from '../hooks/useTableStore';
import { buildActionContext } from '../actions/buildActionContext';
import type { TableObjectYMap } from '../store/types';
import { registerDefaultActions } from '../actions/registerDefaultActions';
import type { ActionContext } from '../actions/types';
import { CommandPalette } from '../components/CommandPalette';
import { ContextMenu } from '../components/ContextMenu';
import { GlobalMenuBar } from '../components/GlobalMenuBar';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useContextMenu } from '../hooks/useContextMenu';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

export const Route = createFileRoute('/dev/table/$id')({
  component: DevTable,
});

function DevTable() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [objectCount, setObjectCount] = useState(0);

  // Set up object change subscription when store is ready
  const handleStoreReady = useCallback((store: YjsStore) => {
    // Get initial object count (M3.6-T4: use objects.size directly)
    const count = store.objects.size;
    setObjectCount(count);
    console.log(`[DevTable] Loaded ${count} objects from IndexedDB`);

    // Subscribe to object changes
    const unsubscribe = store.onObjectsChange((changes) => {
      // Update object count based on current state (M3.6-T4: use objects.size directly)
      setObjectCount(store.objects.size);

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

  const commandPalette = useCommandPalette();
  const contextMenu = useContextMenu();
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(
    'pan',
  );
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);

  // Register default actions (shared with table route)
  useEffect(() => {
    registerDefaultActions();
  }, []);

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
    resetToTestScene(store);
  };

  // Track selection state for action context (M3.6-T4)
  // Now stores {id, yMap} pairs directly - zero allocations
  const [selectedObjects, setSelectedObjects] = useState<
    Array<{ id: string; yMap: TableObjectYMap }>
  >([]);

  // Subscribe to store changes to update selection state
  useEffect(() => {
    if (!store) return;

    const updateSelection = () => {
      // Use getObjectsSelectedBy() - returns {id, yMap} pairs
      const selected = store.getObjectsSelectedBy(store.getActorId());
      setSelectedObjects(selected);
    };

    // Initial selection state
    updateSelection();

    // Subscribe to changes
    const unsubscribe = store.onObjectsChange(() => {
      updateSelection();
    });

    return unsubscribe;
  }, [store]);

  // Create action context with live selection info (M3.6-T4)
  // Now passes {id, yMap} pairs directly - zero allocations
  const actionContext: ActionContext | null = useMemo(() => {
    return buildActionContext(
      store,
      selectedObjects,
      (path: string) => {
        void navigate({ to: path });
      },
      `/dev/table/${id}`,
      gridSnapEnabled,
      setGridSnapEnabled,
    );
  }, [
    store,
    selectedObjects,
    navigate,
    id,
    gridSnapEnabled,
    setGridSnapEnabled,
  ]);

  // Enable keyboard shortcuts
  useKeyboardShortcuts(actionContext);

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
            onContextMenu={contextMenu.open}
            interactionMode={interactionMode}
            onInteractionModeChange={setInteractionMode}
            isMultiSelectMode={isMultiSelectMode}
            onMultiSelectModeChange={setIsMultiSelectMode}
            gridSnapEnabled={gridSnapEnabled}
            onGridSnapEnabledChange={setGridSnapEnabled}
            actionContext={actionContext}
            onActionExecuted={commandPalette.recordAction}
          />
        ) : (
          <div>Initializing table state...</div>
        )}
      </Suspense>

      {/* Global Menu Bar (M3.5.1-T5) */}
      <GlobalMenuBar
        interactionMode={interactionMode}
        onInteractionModeChange={setInteractionMode}
        onCommandPaletteOpen={commandPalette.open}
        isMultiSelectMode={isMultiSelectMode}
        onMultiSelectModeChange={setIsMultiSelectMode}
        gridSnapEnabled={gridSnapEnabled}
        onGridSnapEnabledChange={setGridSnapEnabled}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
        context={actionContext}
        recentActionIds={commandPalette.recentActions}
        onActionExecuted={commandPalette.recordAction}
      />

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={contextMenu.close}
        context={actionContext}
      />
    </div>
  );
}
