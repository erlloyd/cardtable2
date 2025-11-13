import { useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';

// Lazy load the Board component
const Board = lazy(() => import('../components/Board'));

function Table() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="table">
      <header className="table-header">
        <h2>Table: {id}</h2>
      </header>
      <main className="table-main">
        <Suspense fallback={<div>Loading board...</div>}>
          <Board tableId={id!} />
        </Suspense>
      </main>
    </div>
  );
}

export default Table;
