import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { useTableStore } from '../hooks/useTableStore';

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
    </div>
  );
}
