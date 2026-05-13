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
import { ObjectKind, type GameAssets } from '@cardtable2/shared';
import { useTableStore } from '../hooks/useTableStore';
import { buildActionContext } from '../actions/buildActionContext';
import type { TableObjectYMap } from '../store/types';
import { registerDefaultActions } from '../actions/registerDefaultActions';
import type { ActionContext } from '../actions/types';
import { CommandPalette } from '../components/CommandPalette';
import {
  DeckImportModal,
  type DeckImportModalLabels,
} from '../components/DeckImportModal';
import {
  LoadPickerModal,
  type LoadPickerSelectHandler,
  type DerivedItemsResolver,
} from '../components/load-picker/LoadPickerModal';
import { ContextMenu } from '../components/ContextMenu';
import { GlobalMenuBar } from '../components/GlobalMenuBar';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useContextMenu } from '../hooks/useContextMenu';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  registerLoadablesActions,
  unregisterLoadablesActions,
} from '../actions/registerDefaultActions';
import {
  handleLoadSelection,
  setDeckInputProvider,
  type DeckInputResult,
} from '../content/loadHandler';
import { spawnGenericCounter } from '../content/counterSpawn';
import { getLoadableEntries } from '../content/loadablesRegistry';
import type { LoadableEntry } from '@cardtable2/shared';

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
  /** See `routes/table.$id.tsx` — host-driven deck-import modal state. */
  const [deckImport, setDeckImport] = useState<{
    open: boolean;
    labels: DeckImportModalLabels;
    supportsPrivate: boolean;
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    labels: { siteName: '', inputPlaceholder: '' },
    supportsPrivate: false,
    loading: false,
    error: null,
  });
  const deckImportResolveRef = useRef<
    ((value: DeckInputResult | null) => void) | null
  >(null);
  const [loadPicker, setLoadPicker] = useState<{
    open: boolean;
    presetType?: string;
  }>({ open: false });
  const [loadables, setLoadables] = useState<LoadableEntry[]>(() =>
    getLoadableEntries(),
  );
  const [gameAssets, setGameAssets] = useState<GameAssets | null>(null);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(
    'pan',
  );
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);

  // Register default actions (shared with table route)
  useEffect(() => {
    registerDefaultActions();
  }, []);

  // Subscribe to store gameAssets changes so the loadables-derivation effect
  // below can re-run when a dev tool / scenario load populates the registry.
  // Mirrors the main route's pattern (see `routes/table.$id.tsx` ~line 437).
  useEffect(() => {
    if (!store) return;

    const unsubscribe = store.onGameAssetsChange((assets) => {
      setGameAssets(assets);
    });

    return unsubscribe;
  }, [store]);

  // Re-derive per-type Load... actions whenever the loadable registry might
  // have changed. Dev tables don't auto-load a plugin, so this typically
  // starts empty and populates only after a manual `loadPluginAssets` /
  // local-dev scenario load. Depending on `gameAssets` (matches
  // `table.$id.tsx`'s pattern, ct-rde) drives re-derivation when those
  // sources fire.
  useEffect(() => {
    const entries = getLoadableEntries();
    setLoadables(entries);
    unregisterLoadablesActions();
    if (entries.length > 0) {
      registerLoadablesActions(entries);
    }
  }, [gameAssets]);

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

  const handleOpenLoadPicker = useCallback((presetType?: string) => {
    setLoadPicker({ open: true, presetType });
  }, []);

  // Register deck-input provider — see routes/table.$id.tsx for the full doc.
  useEffect(() => {
    const previous = setDeckInputProvider(
      ({ labels, supportsPrivate }) =>
        new Promise<DeckInputResult | null>((resolve) => {
          deckImportResolveRef.current = resolve;
          setDeckImport({
            open: true,
            labels,
            supportsPrivate,
            loading: false,
            error: null,
          });
        }),
    );
    return () => {
      setDeckInputProvider(previous);
    };
  }, []);

  const handleDeckImportClose = useCallback(() => {
    if (deckImportResolveRef.current) {
      deckImportResolveRef.current(null);
      deckImportResolveRef.current = null;
    }
    setDeckImport((prev) => ({ ...prev, open: false }));
  }, []);

  const handleDeckImportSubmit = useCallback(
    (deckId: string, isPrivate: boolean) => {
      if (deckImportResolveRef.current) {
        deckImportResolveRef.current({ deckId, isPrivate });
        deckImportResolveRef.current = null;
      }
      setDeckImport((prev) => ({ ...prev, open: false }));
    },
    [],
  );

  const handleCloseLoadPicker = useCallback(() => {
    setLoadPicker({ open: false });
  }, []);

  const resolveDerivedItems = useCallback<DerivedItemsResolver>((entry) => {
    if (entry.source.kind === 'static') {
      return entry.source.items.map((it) => ({
        typeId: it.typeId,
        label: it.label,
        data: it.data,
      }));
    }
    return [];
  }, []);

  const handleLoadPickerSelect = useCallback<LoadPickerSelectHandler>(
    (entry, item) => {
      if (!store) return;
      // Dev table has no Board reference for camera state — fall back to
      // origin/un-zoomed; placement primitive returns sensible defaults.
      void handleLoadSelection(entry, item, {
        store,
        getViewportState: () =>
          Promise.resolve({
            cameraX: 0,
            cameraY: 0,
            cameraScale: 1,
            viewportWidth: 0,
            viewportHeight: 0,
            devicePixelRatio: window.devicePixelRatio || 1,
          }),
      });
    },
    [store],
  );

  // Always-available "Load Counter..." action (ct-73z). Dev table has no
  // BoardHandle ref for viewport-center placement, so we fall back to the
  // origin/un-zoomed viewport stub — matches the loadHandler fallback above.
  const handleSpawnGenericCounter = useCallback(() => {
    if (!store) return;
    void spawnGenericCounter({
      store,
      getViewportState: () =>
        Promise.resolve({
          cameraX: 0,
          cameraY: 0,
          cameraScale: 1,
          viewportWidth: 0,
          viewportHeight: 0,
          devicePixelRatio: window.devicePixelRatio || 1,
        }),
    });
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
      undefined,
      handleOpenLoadPicker,
      handleSpawnGenericCounter,
    );
  }, [
    store,
    selectedObjects,
    navigate,
    id,
    gridSnapEnabled,
    setGridSnapEnabled,
    handleOpenLoadPicker,
    handleSpawnGenericCounter,
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

      {/* Deck Import Modal — opened by the loadHandler's provider branch via
          the registered deckInputProvider. */}
      <DeckImportModal
        isOpen={deckImport.open}
        onClose={handleDeckImportClose}
        onSubmit={handleDeckImportSubmit}
        labels={deckImport.labels}
        supportsPrivate={deckImport.supportsPrivate}
        loading={deckImport.loading}
        error={deckImport.error}
      />

      {/* Load Picker Modal (ct-8gf.5) */}
      <LoadPickerModal
        open={loadPicker.open}
        onClose={handleCloseLoadPicker}
        loadables={loadables}
        presetType={loadPicker.presetType}
        onSelectItem={handleLoadPickerSelect}
        resolveDerivedItems={resolveDerivedItems}
        gameAssets={gameAssets}
      />
    </div>
  );
}
