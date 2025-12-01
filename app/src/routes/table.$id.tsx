import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTableStore } from '../hooks/useTableStore';
import type { TableObject } from '@cardtable2/shared';
import { CommandPalette } from '../components/CommandPalette';
import { ContextMenu } from '../components/ContextMenu';
import { GlobalMenuBar } from '../components/GlobalMenuBar';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useContextMenu } from '../hooks/useContextMenu';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { buildActionContext } from '../actions/buildActionContext';
import { registerDefaultActions } from '../actions/registerDefaultActions';
import type { ActionContext } from '../actions/types';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

export const Route = createFileRoute('/table/$id')({
  component: Table,
});

function Table() {
  const { id } = Route.useParams();
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

  // Register default actions (shared with dev route)
  useEffect(() => {
    registerDefaultActions();
  }, []);

  // Track selection state for action context
  const [selectionState, setSelectionState] = useState<{
    ids: string[];
    objects: TableObject[];
  }>({ ids: [], objects: [] });

  // Subscribe to store changes to update selection state
  useEffect(() => {
    if (!store) return;

    const updateSelection = () => {
      const allObjects = store.getAllObjects();
      const actorId = store.getActorId();

      // Find all objects selected by this actor
      const selectedIds: string[] = [];
      const selectedObjects: TableObject[] = [];

      for (const [id, obj] of allObjects.entries()) {
        if (obj._selectedBy === actorId) {
          selectedIds.push(id);
          selectedObjects.push(obj);
        }
      }

      setSelectionState({ ids: selectedIds, objects: selectedObjects });
    };

    // Initial selection state
    updateSelection();

    // Subscribe to changes
    const unsubscribe = store.onObjectsChange(() => {
      updateSelection();
    });

    return unsubscribe;
  }, [store]);

  // Create action context with live selection info
  const actionContext: ActionContext | null = useMemo(() => {
    const { ids, objects } = selectionState;
    const context = buildActionContext(store, ids, objects);

    if (context) {
      console.log('[Table] Action context updated:', {
        selectionCount: context.selection.count,
        hasStacks: context.selection.hasStacks,
        hasTokens: context.selection.hasTokens,
      });
    }

    return context;
  }, [store, selectionState]);

  // Enable keyboard shortcuts
  useKeyboardShortcuts(actionContext);

  return (
    <div className="table">
      <Suspense fallback={<div>Loading board...</div>}>
        {store && isStoreReady ? (
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
