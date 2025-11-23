import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTableStore } from '../hooks/useTableStore';
import { CommandPalette } from '../components/CommandPalette';
import { useCommandPalette } from '../hooks/useCommandPalette';
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

  // Register some test actions
  useEffect(() => {
    const registry = ActionRegistry.getInstance();

    // Test action: Say Hello
    registry.register({
      id: 'test-hello',
      label: 'Say Hello',
      icon: '👋',
      shortcut: 'H',
      category: CARD_ACTIONS,
      description: 'Display a hello message in the console',
      isAvailable: () => true,
      execute: () => {
        console.log('Hello from Command Palette!');
        alert('Hello from Command Palette!');
      },
    });

    // Test action: Clear All
    registry.register({
      id: 'test-clear',
      label: 'Clear All Objects',
      icon: '🗑️',
      shortcut: 'Shift+C',
      category: CARD_ACTIONS,
      description: 'Remove all objects from the table',
      isAvailable: (ctx) => {
        // Only available if there are objects
        return ctx.store.getAllObjects().size > 0;
      },
      execute: (ctx) => {
        ctx.store.clearAllObjects();
        console.log('Cleared all objects');
      },
    });

    // Additional test actions for scrolling/search
    registry.register({
      id: 'flip-cards',
      label: 'Flip Selected Cards',
      icon: '🔄',
      shortcut: 'F',
      category: CARD_ACTIONS,
      description: 'Flip all selected cards face up or face down',
      isAvailable: () => true,
      execute: () => console.log('Flip cards'),
    });

    registry.register({
      id: 'rotate-clockwise',
      label: 'Rotate Clockwise',
      icon: '↻',
      shortcut: 'R',
      category: CARD_ACTIONS,
      description: 'Rotate selected objects 90 degrees clockwise',
      isAvailable: () => true,
      execute: () => console.log('Rotate clockwise'),
    });

    registry.register({
      id: 'rotate-counter',
      label: 'Rotate Counter-Clockwise',
      icon: '↺',
      shortcut: 'Shift+R',
      category: CARD_ACTIONS,
      description: 'Rotate selected objects 90 degrees counter-clockwise',
      isAvailable: () => true,
      execute: () => console.log('Rotate counter-clockwise'),
    });

    registry.register({
      id: 'shuffle-deck',
      label: 'Shuffle Deck',
      icon: '🎲',
      category: CARD_ACTIONS,
      description: 'Shuffle all cards in the selected deck',
      isAvailable: () => true,
      execute: () => console.log('Shuffle deck'),
    });

    registry.register({
      id: 'draw-card',
      label: 'Draw Card',
      icon: '🃏',
      shortcut: 'D',
      category: CARD_ACTIONS,
      description: 'Draw a card from the deck',
      isAvailable: () => true,
      execute: () => console.log('Draw card'),
    });

    registry.register({
      id: 'deal-cards',
      label: 'Deal Cards',
      icon: '📤',
      category: CARD_ACTIONS,
      description: 'Deal cards to all players',
      isAvailable: () => true,
      execute: () => console.log('Deal cards'),
    });

    registry.register({
      id: 'stack-cards',
      label: 'Stack Cards',
      icon: '📚',
      category: CARD_ACTIONS,
      description: 'Stack selected cards together',
      isAvailable: () => true,
      execute: () => console.log('Stack cards'),
    });

    registry.register({
      id: 'unstack-cards',
      label: 'Unstack Cards',
      icon: '📖',
      category: CARD_ACTIONS,
      description: 'Unstack the selected stack',
      isAvailable: () => true,
      execute: () => console.log('Unstack cards'),
    });

    registry.register({
      id: 'peek-card',
      label: 'Peek at Top Card',
      icon: '👀',
      category: CARD_ACTIONS,
      description: 'Look at the top card without revealing to others',
      isAvailable: () => true,
      execute: () => console.log('Peek at card'),
    });

    registry.register({
      id: 'reveal-card',
      label: 'Reveal Card',
      icon: '💡',
      category: CARD_ACTIONS,
      description: 'Reveal the selected card to all players',
      isAvailable: () => true,
      execute: () => console.log('Reveal card'),
    });

    registry.register({
      id: 'lock-object',
      label: 'Lock Object',
      icon: '🔒',
      shortcut: 'L',
      category: CARD_ACTIONS,
      description: 'Lock the selected object to prevent modifications',
      isAvailable: () => true,
      execute: () => console.log('Lock object'),
    });

    registry.register({
      id: 'unlock-object',
      label: 'Unlock Object',
      icon: '🔓',
      shortcut: 'Shift+L',
      category: CARD_ACTIONS,
      description: 'Unlock the selected object',
      isAvailable: () => true,
      execute: () => console.log('Unlock object'),
    });

    registry.register({
      id: 'duplicate-object',
      label: 'Duplicate Object',
      icon: '📋',
      shortcut: 'Cmd+D',
      category: CARD_ACTIONS,
      description: 'Create a copy of the selected object',
      isAvailable: () => true,
      execute: () => console.log('Duplicate object'),
    });

    registry.register({
      id: 'delete-object',
      label: 'Delete Object',
      icon: '🗑️',
      shortcut: 'Delete',
      category: CARD_ACTIONS,
      description: 'Delete the selected object',
      isAvailable: () => true,
      execute: () => console.log('Delete object'),
    });
  }, []);

  // Create action context
  const actionContext: ActionContext | null = useMemo(() => {
    if (!store) return null;

    return {
      store,
      selection: {
        ids: [],
        objects: [],
        count: 0,
        hasStacks: false,
        hasTokens: false,
        hasMixed: false,
        allLocked: false,
        allUnlocked: true,
        canAct: true,
      },
      actorId: store.getActorId(),
    };
  }, [store]);

  return (
    <div className="table">
      <Suspense fallback={<div>Loading board...</div>}>
        {store && isStoreReady ? (
          <Board
            tableId={id}
            store={store}
            connectionStatus={connectionStatus}
            showDebugUI={false}
          />
        ) : (
          <div>Initializing table state...</div>
        )}
      </Suspense>

      {/* Command Palette Button */}
      <button
        type="button"
        className="command-palette-button"
        onClick={commandPalette.open}
        aria-label="Open command palette"
      >
        Commands
      </button>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
        context={actionContext}
        recentActionIds={commandPalette.recentActions}
        onActionExecuted={commandPalette.recordAction}
      />
    </div>
  );
}
