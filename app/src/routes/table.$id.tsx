import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
import { loadCompleteScenario } from '../content';
import type { GamesIndex } from '../types/game';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

// Search params validation
type TableSearch = {
  gameId?: string;
};

export const Route = createFileRoute('/table/$id')({
  component: Table,
  validateSearch: (search: Record<string, unknown>): TableSearch => {
    return {
      gameId: search.gameId as string | undefined,
    };
  },
});

function Table() {
  const { id } = Route.useParams();
  const { gameId } = Route.useSearch();
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
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Register default actions (shared with dev route)
  useEffect(() => {
    registerDefaultActions();
  }, []);

  // Load game content if gameId is provided
  useEffect(() => {
    if (!gameId || !store || !isStoreReady) {
      return;
    }

    // Only load content if the table is empty
    if (store.getAllObjects().size > 0) {
      console.log('[Table] Table already has objects, skipping content load');
      return;
    }

    const loadContent = async () => {
      setContentLoading(true);
      setContentError(null);

      try {
        console.log(`[Table] Loading game: ${gameId}`);

        // Load games index
        const response = await fetch('/gamesIndex.json');
        if (!response.ok) {
          throw new Error('Failed to load games index');
        }
        const gamesIndex = (await response.json()) as GamesIndex;

        // Find the game
        const game = gamesIndex.games.find((g) => g.id === gameId);
        if (!game) {
          throw new Error(`Game not found: ${gameId}`);
        }

        console.log(`[Table] Loading scenario from: ${game.manifestUrl}`);

        // Load the complete scenario
        const content = await loadCompleteScenario(game.manifestUrl);

        console.log(
          `[Table] Loaded ${content.objects.size} objects from scenario: ${content.scenario.name}`,
        );

        // Add all objects to the store
        for (const [objId, obj] of content.objects) {
          store.setObject(objId, obj);
        }

        console.log('[Table] Content loaded successfully');
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load content';
        console.error('[Table] Content loading error:', err);
        setContentError(errorMessage);
      } finally {
        setContentLoading(false);
      }
    };

    void loadContent();
  }, [gameId, store, isStoreReady]);

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
        ) : contentLoading ? (
          <div>Loading game content...</div>
        ) : contentError ? (
          <div>Error loading content: {contentError}</div>
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
