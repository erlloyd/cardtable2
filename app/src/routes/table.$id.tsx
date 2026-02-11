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
import { ActionRegistry } from '../actions/ActionRegistry';
import { registerAttachmentActions } from '../actions/attachmentActions';
import type { ActionContext } from '../actions/types';
import type { TableObjectYMap } from '../store/types';
import {
  loadGameAssetPacks,
  reloadScenarioFromMetadata,
  type GameAssets,
  type LoadedScenarioMetadata,
} from '../content';
import { CONTENT_RELOAD_INVALID_METADATA } from '../constants/errorIds';

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

  // Load content on mount: either reload scenario from metadata or load base game assets
  // Note: Dependencies are [store, isStoreReady] only - we intentionally do NOT
  // depend on store.metadata because it's set once on mount and never changes
  // during the session. Depending on metadata would cause unnecessary reloads when
  // other metadata properties change. The effect only needs to run once when the
  // store becomes ready.
  useEffect(() => {
    if (!store || !isStoreReady) {
      return;
    }

    const loadContent = async () => {
      setPacksLoading(true);
      setPacksError(null);

      try {
        // Check if there's a previously loaded scenario to restore
        const loadedScenario = store.metadata.get('loadedScenario') as
          | LoadedScenarioMetadata
          | undefined;

        if (loadedScenario) {
          // Reload scenario from metadata (for persistence and multiplayer)
          console.log('[Table] Reloading scenario from metadata:', {
            type: loadedScenario.type,
            scenarioName: loadedScenario.scenarioName,
          });

          const content = await reloadScenarioFromMetadata(loadedScenario);

          // On reload: Only restore gameAssets, NOT objects
          // Objects are already persisted in IndexedDB with their current state.
          // Re-adding them would overwrite user modifications (moved stacks, etc.)
          console.log(
            '[Table] Restoring gameAssets only (objects already in IndexedDB)',
          );
          store.setGameAssets(content.content);
          registerAttachmentActions(
            ActionRegistry.getInstance(),
            content.content,
          );
        } else {
          // No scenario loaded - fall back to loading base game asset packs
          const gameId = store.metadata.get('gameId') as string | undefined;
          if (!gameId) {
            console.log('[Table] No gameId in metadata, skipping pack loading');
            // Clear error when in blank state (no gameId, no scenario)
            setPacksError(null);
            setPacksLoading(false);
            return;
          }

          console.log('[Table] Loading base game asset packs for:', gameId);
          const assets = await loadGameAssetPacks(gameId);
          store.setGameAssets(assets);
          registerAttachmentActions(ActionRegistry.getInstance(), assets);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load content';
        console.error('[Table] Content loading error:', err);
        setPacksError(errorMessage);
      } finally {
        setPacksLoading(false);
      }
    };

    void loadContent();

    // Observe metadata changes to detect when table is reset
    const observer = () => {
      const loadedScenario = store.metadata.get('loadedScenario');
      const gameId = store.metadata.get('gameId');

      // If both are cleared (table reset), clear error
      if (!loadedScenario && !gameId) {
        console.log('[Table] Metadata cleared, clearing error state');
        setPacksError(null);
      }
    };

    store.metadata.observe(observer);
    return () => {
      store.metadata.unobserve(observer);
    };
  }, [store, isStoreReady]);

  // Subscribe to store gameAssets changes
  useEffect(() => {
    if (!store) return;

    const unsubscribe = store.onGameAssetsChange((assets) => {
      setGameAssets(assets);
    });

    return unsubscribe;
  }, [store]);

  // Observe metadata changes for multiplayer scenario loading
  //
  // When a remote player loads a scenario, we need to reload it locally to get gameAssets.
  //
  // Why gameAssets aren't in Y.Doc:
  // - gameAssets contain large data structures (card definitions, image URLs, etc.)
  // - Storing them in Y.Doc would cause excessive sync overhead for every change
  // - Y.Doc is optimized for operational transforms on structured data, not large immutable objects
  // - Instead, we store minimal metadata (type, pluginId, scenarioFile) and reload on each client
  //
  // Race condition handling:
  // - If scenario changes while loading, we compare loadedAt timestamps
  // - Stale gameAssets are discarded to prevent incorrect rendering
  useEffect(() => {
    if (!store || !isStoreReady) return;

    const observer = (
      _event: unknown,
      transaction: { local: boolean },
    ): void => {
      // Only react to remote changes (from other players)
      if (transaction.local) return;

      const loadedScenario = store.metadata.get('loadedScenario') as
        | LoadedScenarioMetadata
        | undefined;

      // Validate metadata structure
      if (
        loadedScenario &&
        (typeof loadedScenario !== 'object' || !loadedScenario.type)
      ) {
        console.error('[Table] Invalid loadedScenario metadata from remote', {
          errorId: CONTENT_RELOAD_INVALID_METADATA,
          metadata: loadedScenario,
        });
        return;
      }

      // If a remote player loaded a scenario, reload it locally to get gameAssets
      if (loadedScenario && !store.getGameAssets()) {
        console.log('[Table] Remote player loaded scenario, reloading locally');
        setPacksLoading(true);
        setPacksError(null);

        // Capture metadata timestamp to detect stale scenarios
        const metadataTimestamp = loadedScenario.loadedAt;

        void reloadScenarioFromMetadata(loadedScenario)
          .then((content) => {
            // Check if scenario metadata changed while loading (race condition)
            const currentMetadata = store.metadata.get('loadedScenario') as
              | LoadedScenarioMetadata
              | undefined;

            if (
              !currentMetadata ||
              currentMetadata.loadedAt !== metadataTimestamp
            ) {
              console.log(
                '[Table] Scenario changed during load, discarding stale assets',
                {
                  loadedScenario: loadedScenario.scenarioName,
                  loadedAt: metadataTimestamp,
                  currentScenario: currentMetadata?.scenarioName,
                  currentLoadedAt: currentMetadata?.loadedAt,
                },
              );
              return;
            }

            // Metadata still matches - safe to set gameAssets
            store.setGameAssets(content.content);
            console.log(
              '[Table] Remote scenario loaded successfully:',
              content.scenario.name,
            );
          })
          .catch((err: unknown) => {
            const errorMessage =
              err instanceof Error
                ? err.message
                : 'Failed to load remote scenario';
            const errorObject =
              err instanceof Error ? err : new Error(String(err));
            console.error('[Table] Remote scenario loading error:', {
              error: errorObject,
              errorMessage,
              metadata: loadedScenario,
            });
            setPacksError(errorMessage);
          })
          .finally(() => {
            setPacksLoading(false);
          });
      }
    };

    store.metadata.observe(observer);
    return () => {
      store.metadata.unobserve(observer);
    };
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
