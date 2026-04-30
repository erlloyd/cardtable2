import {
  createFileRoute,
  useNavigate,
  useLocation,
} from '@tanstack/react-router';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTableStore } from '../hooks/useTableStore';
import { CommandPalette } from '../components/CommandPalette';
import { ContextMenu } from '../components/ContextMenu';
import { GlobalMenuBar } from '../components/GlobalMenuBar';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useContextMenu } from '../hooks/useContextMenu';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { resetTable } from '../store/YjsActions';
import { buildActionContext } from '../actions/buildActionContext';
import { registerDefaultActions } from '../actions/registerDefaultActions';
import { ActionRegistry } from '../actions/ActionRegistry';
import { registerAttachmentActions } from '../actions/attachmentActions';
import { registerHandActions } from '../actions/handActions';
import type { ActionContext } from '../actions/types';
import type { TableObjectYMap } from '../store/types';
import { HandPanel } from '../components/HandPanel';
import { ComponentSetModal } from '../components/ComponentSetModal';
import type { BoardHandle } from '../components/Board';
import { useHandPanel } from '../hooks/useHandPanel';
import { moveAllCardsToHand } from '../store/YjsHandActions';
import {
  loadPluginAssets,
  type GameAssets,
  type LoadedScenarioMetadata,
} from '../content';
import { CONTENT_RELOAD_INVALID_METADATA } from '../constants/errorIds';
import { ObjectKind } from '@cardtable2/shared';

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
  const [componentSetModalOpen, setComponentSetModalOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(
    'pan',
  );
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [gameAssets, setGameAssets] = useState<GameAssets | null>(null);

  // Hand panel state
  const handPanel = useHandPanel(store);

  // Drag coordination between board and hand panel
  const boardRef = useRef<BoardHandle>(null);
  const handPanelRef = useRef<HTMLDivElement>(null);
  const [isBoardDragging, setIsBoardDragging] = useState(false);
  const [isPhantomDragActive, setIsPhantomDragActive] = useState(false);
  const [phantomFeedback, setPhantomFeedback] = useState<{
    worldX: number;
    worldY: number;
    snapPos?: { x: number; y: number };
    stackTargetId?: string;
  } | null>(null);

  const [isStackDragOverHand, setIsStackDragOverHand] = useState(false);
  const isStackDragOverHandRef = useRef(false);
  isStackDragOverHandRef.current = isStackDragOverHand;

  const handleBoardDragStart = useCallback(() => {
    setIsBoardDragging(true);
  }, []);

  // Drop logic: when drag ends while hovering over hand panel, move stacks to hand
  const handleBoardDragEnd = useCallback(() => {
    if (isStackDragOverHandRef.current && store) {
      // Auto-create hand if none exist
      let targetHandId = handPanel.activeHandId;
      if (!targetHandId) {
        targetHandId = store.createHand('Hand 1');
        handPanel.setActiveHandId(targetHandId);
      }

      // Move all cards from selected stacks to hand
      const selected = store.getObjectsSelectedBy(store.getActorId());
      for (const obj of selected) {
        if (obj.yMap.get('_kind') === ObjectKind.Stack) {
          moveAllCardsToHand(store, obj.id, targetHandId);
        }
      }
    }

    setIsBoardDragging(false);
    setIsStackDragOverHand(false);
  }, [store, handPanel]);

  // Track whether a stack drag is hovering over the hand panel
  useEffect(() => {
    if (!isBoardDragging || !store) return;

    const handlePointerMove = (e: PointerEvent) => {
      // Check selection on each move (not at effect setup) because
      // in worker mode, selection may arrive after drag-started
      const selected = store.getObjectsSelectedBy(store.getActorId());
      const hasStack = selected.some(
        (obj) => obj.yMap.get('_kind') === ObjectKind.Stack,
      );
      if (!hasStack) {
        if (isStackDragOverHandRef.current) setIsStackDragOverHand(false);
        return;
      }

      const panelEl = handPanelRef.current;
      if (!panelEl) return;

      const rect = panelEl.getBoundingClientRect();
      const isOverPanel =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      // Only update state when the value actually changes
      if (isOverPanel !== isStackDragOverHandRef.current) {
        setIsStackDragOverHand(isOverPanel);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      setIsStackDragOverHand(false);
    };
  }, [isBoardDragging, store]);

  // Register default actions (shared with dev route)
  useEffect(() => {
    registerDefaultActions();
    registerHandActions(ActionRegistry.getInstance());
  }, []);

  // Dev-only: apply URL seed (?seed=stack-of-5) on a fresh table.
  // No-op in production and no-op when the table already has objects.
  useEffect(() => {
    if (!import.meta.env.DEV && !import.meta.env.VITE_E2E) return;
    if (!store || !isStoreReady) return;

    const seedName = new URLSearchParams(location.search).get('seed');
    if (!seedName) return;

    void import('../dev/seeds').then(({ applySeed }) => {
      const result = applySeed(store, seedName);
      if (result.applied) {
        console.log(
          `[seed] applied '${seedName}' — ${result.createdIds.length} object(s) created`,
        );
      } else {
        console.warn(`[seed] did not apply '${seedName}': ${result.reason}`);
      }
    });
  }, [store, isStoreReady, location.search]);

  // Store pluginId in Y.Doc metadata from location state (new table only).
  useEffect(() => {
    if (!store || !isStoreReady) {
      return;
    }

    const stateRecord =
      typeof location.state === 'object' && location.state !== null
        ? (location.state as unknown as Record<string, unknown>)
        : null;
    const pluginIdFromStateRaw = stateRecord?.pluginId;
    const pluginIdFromState =
      typeof pluginIdFromStateRaw === 'string'
        ? pluginIdFromStateRaw
        : undefined;
    const storedPluginId = store.metadata.get('pluginId') as string | undefined;

    // New table: store pluginId from navigation state.
    if (pluginIdFromState && !storedPluginId) {
      console.log(`[Table] Storing pluginId in metadata: ${pluginIdFromState}`);
      store.metadata.set('pluginId', pluginIdFromState);
    }
  }, [location.state, store, isStoreReady]);

  // Load content on mount: a plugin is a property of the table, not of a
  // scenario. Always load the plugin's assets first (eagerly + cached via
  // pluginLoader), then optionally restore a previously loaded scenario.
  //
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
        const pluginId = store.metadata.get('pluginId') as string | undefined;

        if (!pluginId) {
          console.log('[Table] No pluginId in metadata, skipping pack loading');
          // Blank state (no plugin, no scenario) — nothing to load.
          setPacksError(null);
          setPacksLoading(false);
          return;
        }

        // Always load plugin assets first, unconditionally. The plugin loader's
        // in-flight cache dedupes any concurrent callers (e.g. Load Scenario).
        console.log('[Table] Loading plugin assets for:', pluginId);
        const assets = await loadPluginAssets(pluginId);
        store.setGameAssets(assets);
        registerAttachmentActions(ActionRegistry.getInstance(), assets);

        // If scenario metadata was previously stored, only log its presence.
        // On reload we deliberately do NOT fetch the scenario JSON or
        // re-instantiate scenario objects — `gameAssets` were already
        // restored by `loadPluginAssets` above, and the objects themselves
        // are persisted in IndexedDB with their current state (re-adding
        // them would overwrite user modifications).
        const loadedScenario = store.metadata.get('loadedScenario') as
          | LoadedScenarioMetadata
          | undefined;
        if (loadedScenario && loadedScenario.type === 'plugin') {
          console.log('[Table] Reloaded scenario metadata present:', {
            type: loadedScenario.type,
            scenarioName: loadedScenario.scenarioName,
          });
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

    // Observe metadata changes to detect when table is reset.
    // resetTable() clears `loadedScenario` but preserves `pluginId` and the
    // store's gameAssets — the table is still bound to its plugin after a
    // reset, just with no objects placed.
    const observer = () => {
      const loadedScenario = store.metadata.get('loadedScenario');

      if (!loadedScenario) {
        console.log('[Table] loadedScenario cleared, clearing error state');
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

  // Observe metadata changes for multiplayer asset loading.
  //
  // Two remote-driven paths reach here:
  //
  // 1. Bare-pluginId arrival (multiplayer JOIN). Player A creates a fresh
  //    table and writes `pluginId` to metadata; Player B joins the same URL
  //    with empty IndexedDB. B's mount effect runs at `isStoreReady` and sees
  //    no `pluginId` (IndexedDB had nothing to hydrate); the WebSocket then
  //    syncs `pluginId` in afterwards. Without this observer reacting to the
  //    bare `pluginId` write, B's `gameAssets` would stay null and any
  //    CRDT-synced objects would render without their plugin assets.
  //
  // 2. Remote scenario load. Another player loads a scenario; we need plugin
  //    assets locally to render the objects that the CRDT just synced in.
  //    `loadedScenario.pluginId` is authoritative for which plugin to load,
  //    and the `loadedAt` timestamp guards against a stale-load race when the
  //    scenario changes mid-fetch.
  //
  // Both paths converge on the same load primitive (`loadPluginAssets`). The
  // pluginLoader's in-flight cache dedupes concurrent calls, so there's no
  // harm if both an early `pluginId` and a later `loadedScenario` arrive in
  // separate transactions for the same plugin.
  //
  // We do NOT re-instantiate scenario objects here: the remote already added
  // them to Y.Doc and they sync via the CRDT. We only need the plugin
  // assets (cards, tokens, attachments) to render them.
  //
  // Why gameAssets aren't in Y.Doc:
  // - gameAssets contain large data structures (card definitions, image URLs, etc.)
  // - Storing them in Y.Doc would cause excessive sync overhead for every change
  // - Y.Doc is optimized for operational transforms on structured data, not large immutable objects
  // - Instead, we store minimal metadata (type, pluginId, scenarioFile) and load assets per-client
  useEffect(() => {
    if (!store || !isStoreReady) return;

    const observer = (
      _event: unknown,
      transaction: { local: boolean },
    ): void => {
      // Only react to remote changes (from other players)
      if (transaction.local) return;

      // If we already have assets, nothing to do.
      if (store.getGameAssets()) return;

      const loadedScenario = store.metadata.get('loadedScenario') as
        | LoadedScenarioMetadata
        | undefined;

      // Validate scenario metadata structure when present.
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

      // Resolve which pluginId to load and whether we need stale-load
      // race-checking. Scenario path is authoritative when present (carries a
      // `loadedAt` timestamp); bare-pluginId path is set-once-on-create so no
      // race-check is required.
      //
      // Only the 'plugin' branch of `loadedScenario` is reachable in app code:
      // 'builtin' is unused, and 'local-dev' cannot be reloaded without user
      // interaction.
      let pluginId: string | undefined;
      let metadataTimestamp: number | undefined;
      let source: 'scenario' | 'pluginId';

      if (loadedScenario && loadedScenario.type === 'plugin') {
        pluginId = loadedScenario.pluginId;
        metadataTimestamp = loadedScenario.loadedAt;
        source = 'scenario';
      } else if (!loadedScenario) {
        const bare = store.metadata.get('pluginId') as string | undefined;
        if (bare) {
          pluginId = bare;
          source = 'pluginId';
        } else {
          return;
        }
      } else {
        // loadedScenario present but type !== 'plugin' (builtin/local-dev) —
        // not handled by this observer.
        return;
      }

      if (!pluginId) return;

      console.log(
        `[Table] Remote ${source === 'scenario' ? 'scenario load' : 'pluginId arrival'}; loading plugin assets`,
        { pluginId, source },
      );
      setPacksLoading(true);
      setPacksError(null);

      void loadPluginAssets(pluginId)
        .then((assets) => {
          // Stale-load race-check applies only to scenario-driven loads,
          // where the scenario can change mid-fetch. For bare-pluginId we
          // skip the check (pluginId is set-once on table create).
          if (source === 'scenario') {
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
                  loadedScenario:
                    loadedScenario && loadedScenario.type === 'plugin'
                      ? loadedScenario.scenarioName
                      : undefined,
                  loadedAt: metadataTimestamp,
                  currentScenario: currentMetadata?.scenarioName,
                  currentLoadedAt: currentMetadata?.loadedAt,
                },
              );
              return;
            }
          }

          // If another path already populated assets while we were loading,
          // skip — the in-flight cache made our promise cheap, but
          // double-registering attachment actions is wasted work.
          if (store.getGameAssets()) return;

          store.setGameAssets(assets);
          registerAttachmentActions(ActionRegistry.getInstance(), assets);
          console.log('[Table] Remote plugin assets loaded:', {
            pluginId,
            source,
          });
        })
        .catch((err: unknown) => {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Failed to load remote scenario';
          const errorObject =
            err instanceof Error ? err : new Error(String(err));
          console.error('[Table] Remote plugin asset loading error:', {
            error: errorObject,
            errorMessage,
            pluginId,
            source,
            metadata: loadedScenario,
          });
          setPacksError(errorMessage);
        })
        .finally(() => {
          setPacksLoading(false);
        });
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

  const handleOpenComponentSets = useCallback(() => {
    setComponentSetModalOpen(true);
  }, []);

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
      handPanel.activeHandId ?? undefined,
      handleOpenComponentSets,
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
    handPanel.activeHandId,
    handleOpenComponentSets,
  ]);

  // Enable keyboard shortcuts
  const handleKeyboardAction = useCallback(() => {
    boardRef.current?.clearPreview();
  }, []);
  useKeyboardShortcuts(actionContext, true, handleKeyboardAction);

  return (
    <div className="table">
      <Suspense fallback={<div className="board-fullscreen" />}>
        {!store || !isStoreReady ? (
          <div className="board-fullscreen" />
        ) : packsLoading ? (
          <div className="board-fullscreen" />
        ) : packsError ? (
          <div className="board-fullscreen table-error">
            <div className="table-error-content">
              <div className="table-error-message">{packsError}</div>
              <div className="table-error-actions">
                <button
                  className="table-error-button"
                  onClick={() => {
                    setPacksError(null);
                    void navigate({ to: '/' });
                  }}
                >
                  Back to Games
                </button>
                <button
                  className="table-error-button table-error-button-secondary"
                  onClick={() => {
                    if (store) {
                      resetTable(store);
                    }
                    setPacksError(null);
                    setPacksLoading(false);
                  }}
                >
                  Reset Table
                </button>
              </div>
            </div>
          </div>
        ) : (
          <Board
            ref={boardRef}
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
            isMenuOpen={contextMenu.isOpen || commandPalette.isOpen}
            isPhantomDragActive={isPhantomDragActive}
            onBoardDragStart={handleBoardDragStart}
            onBoardDragEnd={handleBoardDragEnd}
            onPhantomDragFeedback={setPhantomFeedback}
          />
        )}
      </Suspense>

      {/* Hand Panel */}
      {store && isStoreReady && !packsLoading && !packsError && (
        <HandPanel
          ref={handPanelRef}
          store={store}
          gameAssets={gameAssets}
          activeHandId={handPanel.activeHandId}
          onActiveHandChange={handPanel.setActiveHandId}
          isCollapsed={handPanel.isCollapsed}
          onCollapsedChange={handPanel.setIsCollapsed}
          handIds={handPanel.handIds}
          isStackDragOverHand={isStackDragOverHand}
          boardRef={boardRef}
          phantomDragFeedback={phantomFeedback}
          onPhantomDragActiveChange={setIsPhantomDragActive}
        />
      )}

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

      {/* Component Set Modal */}
      {store && (
        <ComponentSetModal
          isOpen={componentSetModalOpen}
          onClose={() => setComponentSetModalOpen(false)}
          store={store}
          gameAssets={gameAssets}
        />
      )}
    </div>
  );
}
