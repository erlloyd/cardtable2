import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTableStore } from '../hooks/useTableStore';
import type { TableObject } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { CommandPalette } from '../components/CommandPalette';
import { ContextMenu } from '../components/ContextMenu';
import { GlobalMenuBar } from '../components/GlobalMenuBar';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useContextMenu } from '../hooks/useContextMenu';
import { ActionRegistry } from '../actions/ActionRegistry';
import { CARD_ACTIONS } from '../actions/types';
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

  // Register some test actions
  useEffect(() => {
    const registry = ActionRegistry.getInstance();

    // Global action: Say Hello (only when nothing selected)
    registry.register({
      id: 'test-hello',
      label: 'Say Hello',
      icon: '👋',
      shortcut: 'H',
      category: 'Global Actions',
      description: 'Display a hello message (only when nothing selected)',
      isAvailable: (ctx) => ctx.selection.count === 0,
      execute: () => {
        console.log('Hello from Command Palette!');
        alert('Hello from Command Palette!');
      },
    });

    // Global action: Clear All (only when nothing selected)
    registry.register({
      id: 'test-clear',
      label: 'Clear All Objects',
      icon: '🗑️',
      shortcut: 'Shift+C',
      category: 'Global Actions',
      description: 'Remove all objects from the table',
      isAvailable: (ctx) => {
        // Only available when nothing selected AND there are objects
        return ctx.selection.count === 0 && ctx.store.getAllObjects().size > 0;
      },
      execute: (ctx) => {
        ctx.store.clearAllObjects();
        console.log('Cleared all objects');
      },
    });

    // Object action: Flip Cards (only for stacks)
    registry.register({
      id: 'flip-cards',
      label: 'Flip Selected Cards',
      icon: '🔄',
      shortcut: 'F',
      category: CARD_ACTIONS,
      description: 'Flip all selected cards face up or face down',
      isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
      execute: () => console.log('Flip cards'),
    });

    // Object action: Rotate (works on any object)
    registry.register({
      id: 'rotate-clockwise',
      label: 'Rotate Clockwise',
      icon: '↻',
      shortcut: 'R',
      category: CARD_ACTIONS,
      description: 'Rotate selected objects 90 degrees clockwise',
      isAvailable: (ctx) => ctx.selection.count > 0,
      execute: () => console.log('Rotate clockwise'),
    });

    registry.register({
      id: 'rotate-counter',
      label: 'Rotate Counter-Clockwise',
      icon: '↺',
      shortcut: 'Shift+R',
      category: CARD_ACTIONS,
      description: 'Rotate selected objects 90 degrees counter-clockwise',
      isAvailable: (ctx) => ctx.selection.count > 0,
      execute: () => console.log('Rotate counter-clockwise'),
    });

    // Object action: Stack operations (only for stacks)
    registry.register({
      id: 'shuffle-deck',
      label: 'Shuffle Deck',
      icon: '🎲',
      category: CARD_ACTIONS,
      description: 'Shuffle all cards in the selected deck',
      isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
      execute: () => console.log('Shuffle deck'),
    });

    registry.register({
      id: 'draw-card',
      label: 'Draw Card',
      icon: '🃏',
      shortcut: 'D',
      category: CARD_ACTIONS,
      description: 'Draw a card from the deck',
      isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
      execute: () => console.log('Draw card'),
    });

    registry.register({
      id: 'deal-cards',
      label: 'Deal Cards',
      icon: '📤',
      category: CARD_ACTIONS,
      description: 'Deal cards to all players',
      isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
      execute: () => console.log('Deal cards'),
    });

    registry.register({
      id: 'stack-cards',
      label: 'Stack Cards',
      icon: '📚',
      category: CARD_ACTIONS,
      description: 'Stack selected cards together',
      isAvailable: (ctx) => ctx.selection.count > 1 && ctx.selection.hasStacks,
      execute: () => console.log('Stack cards'),
    });

    registry.register({
      id: 'unstack-cards',
      label: 'Unstack Cards',
      icon: '📖',
      category: CARD_ACTIONS,
      description: 'Unstack the selected stack',
      isAvailable: (ctx) =>
        ctx.selection.count === 1 && ctx.selection.hasStacks,
      execute: () => console.log('Unstack cards'),
    });

    registry.register({
      id: 'peek-card',
      label: 'Peek at Top Card',
      icon: '👀',
      category: CARD_ACTIONS,
      description: 'Look at the top card without revealing to others',
      isAvailable: (ctx) =>
        ctx.selection.count === 1 && ctx.selection.hasStacks,
      execute: () => console.log('Peek at card'),
    });

    registry.register({
      id: 'reveal-card',
      label: 'Reveal Card',
      icon: '💡',
      category: CARD_ACTIONS,
      description: 'Reveal the selected card to all players',
      isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.hasStacks,
      execute: () => console.log('Reveal card'),
    });

    // Object action: Lock/Unlock (works on any object)
    registry.register({
      id: 'lock-object',
      label: 'Lock Object',
      icon: '🔒',
      shortcut: 'L',
      category: CARD_ACTIONS,
      description: 'Lock the selected object to prevent modifications',
      isAvailable: (ctx) =>
        ctx.selection.count > 0 && ctx.selection.allUnlocked,
      execute: () => console.log('Lock object'),
    });

    registry.register({
      id: 'unlock-object',
      label: 'Unlock Object',
      icon: '🔓',
      shortcut: 'Shift+L',
      category: CARD_ACTIONS,
      description: 'Unlock the selected object',
      isAvailable: (ctx) => ctx.selection.count > 0 && ctx.selection.allLocked,
      execute: () => console.log('Unlock object'),
    });

    // Object action: Duplicate/Delete (works on any object)
    registry.register({
      id: 'duplicate-object',
      label: 'Duplicate Object',
      icon: '📋',
      shortcut: 'Cmd+D',
      category: CARD_ACTIONS,
      description: 'Create a copy of the selected object',
      isAvailable: (ctx) => ctx.selection.count > 0,
      execute: () => console.log('Duplicate object'),
    });

    registry.register({
      id: 'delete-object',
      label: 'Delete Object',
      icon: '🗑️',
      shortcut: 'Delete',
      category: CARD_ACTIONS,
      description: 'Delete the selected object',
      isAvailable: (ctx) => ctx.selection.count > 0,
      execute: () => console.log('Delete object'),
    });
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
    if (!store) return null;

    const { ids, objects } = selectionState;
    const kinds = new Set(objects.map((obj) => obj._kind));

    const context = {
      store,
      selection: {
        ids,
        objects,
        count: ids.length,
        hasStacks: kinds.has(ObjectKind.Stack),
        hasTokens: kinds.has(ObjectKind.Token),
        hasMixed: kinds.size > 1,
        allLocked: objects.every((obj) => obj._meta?.locked === true),
        allUnlocked: objects.every((obj) => obj._meta?.locked !== true),
        canAct: true, // All selected by this actor
      },
      actorId: store.getActorId(),
    };

    console.log('[Table] Action context updated:', {
      selectionCount: context.selection.count,
      hasStacks: context.selection.hasStacks,
      hasTokens: context.selection.hasTokens,
    });

    return context;
  }, [store, selectionState]);

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
