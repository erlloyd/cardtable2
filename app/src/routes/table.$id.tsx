import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

export const Route = createFileRoute('/table/$id')({
  component: Table,
});

function Table() {
  const { id } = Route.useParams();

  return (
    <div className="table">
      <Suspense fallback={<div>Loading board...</div>}>
        <Board tableId={id} />
      </Suspense>
    </div>
  );
}
