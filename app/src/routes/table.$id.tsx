import {
  createFileRoute,
  useNavigate,
  useLocation,
} from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTableStore } from '../hooks/useTableStore';
import { CommandPalette } from '../components/CommandPalette';
import { ContextMenu } from '../components/ContextMenu';
import { GlobalMenuBar } from '../components/GlobalMenuBar';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useContextMenu } from '../hooks/useContextMenu';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { buildActionContext } from '../actions/buildActionContext';
import { registerDefaultActions } from '../actions/registerDefaultActions';
import type { ActionContext } from '../actions/types';
import type { TableObjectYMap } from '../store/types';
import { loadGameAssetPacks, type GameAssets } from '../content';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

export const Route = createFileRoute('/table/$id')({
  component: Table,
});

function Table() {
  const { id } = Route.useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { store, isStoreReady, connectionStatus } = useTableStore({
    tableId: id,
    logPrefix: 'Table',
  });
  const commandPalette = useCommandPalette();
  const contextMenu = useContextMenu();
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(
    'pan',
  );
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [gameAssets, setGameAssets] = useState<GameAssets | null>(null);

  // Register default actions (shared with dev route)
  useEffect(() => {
    registerDefaultActions();
  }, []);

  // Store gameId in Y.Doc metadata from location state (new table only)
  useEffect(() => {
    if (!store || !isStoreReady) {
      return;
    }

    const gameIdFromState =
      typeof location.state === 'object' &&
      location.state !== null &&
      'gameId' in location.state &&
      typeof location.state.gameId === 'string'
        ? location.state.gameId
        : undefined;
    const storedGameId = store.metadata.get('gameId') as string | undefined;

    // New table: store gameId from navigation state
    if (gameIdFromState && !storedGameId) {
      console.log(`[Table] Storing gameId in metadata: ${gameIdFromState}`);
      store.metadata.set('gameId', gameIdFromState);
    }
  }, [location.state, store, isStoreReady]);

  // Load asset packs for the current game (runs on mount and refresh)
  // Note: Dependencies are [store, isStoreReady] only - we intentionally do NOT
  // depend on store.metadata because gameId is set once on mount and never changes
  // during the session. Depending on metadata would cause unnecessary reloads when
  // other metadata properties change. The effect only needs to run once when the
  // store becomes ready.
  useEffect(() => {
    if (!store || !isStoreReady) {
      return;
    }

    const gameId = store.metadata.get('gameId') as string | undefined;
    if (!gameId) {
      console.log('[Table] No gameId in metadata, skipping pack loading');
      return;
    }

    const loadPacks = async () => {
      setPacksLoading(true);
      setPacksError(null);

      try {
        const assets = await loadGameAssetPacks(gameId);
        setGameAssets(assets);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load asset packs';
        console.error('[Table] Pack loading error:', err);
        setPacksError(errorMessage);
      } finally {
        setPacksLoading(false);
      }
    };

    void loadPacks();
  }, [store, isStoreReady]);

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
    const context = buildActionContext(
      store,
      selectedObjects,
      (path: string) => {
        void navigate({ to: path });
      },
      `/table/${id}`,
      gridSnapEnabled,
      setGridSnapEnabled,
      setGameAssets,
    );

    if (context) {
      console.log('[Table] Action context updated:', {
        selectionCount: context.selection.count,
        hasStacks: context.selection.hasStacks,
        hasTokens: context.selection.hasTokens,
      });
    }

    return context;
  }, [
    store,
    selectedObjects,
    navigate,
    id,
    gridSnapEnabled,
    setGridSnapEnabled,
    setGameAssets,
  ]);

  // Enable keyboard shortcuts
  useKeyboardShortcuts(actionContext);

  return (
    <div className="table">
      <Suspense fallback={<div>Loading board...</div>}>
        {!store || !isStoreReady ? (
          <div>Initializing table state...</div>
        ) : packsLoading ? (
          <div>Loading asset packs...</div>
        ) : packsError ? (
          <div>Error loading packs: {packsError}</div>
        ) : (
          <Board
            tableId={id}
            store={store}
            connectionStatus={connectionStatus}
            showDebugUI={false}
            onContextMenu={contextMenu.open}
            interactionMode={interactionMode}
            onInteractionModeChange={setInteractionMode}
            isMultiSelectMode={isMultiSelectMode}
            onMultiSelectModeChange={setIsMultiSelectMode}
            gridSnapEnabled={gridSnapEnabled}
            onGridSnapEnabledChange={setGridSnapEnabled}
            actionContext={actionContext}
            onActionExecuted={commandPalette.recordAction}
            gameAssets={gameAssets}
          />
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
