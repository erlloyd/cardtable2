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
