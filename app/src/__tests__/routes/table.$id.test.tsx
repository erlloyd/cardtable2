import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { routeTree } from '../../routeTree.gen';
import * as Y from 'yjs';

// Mock the Board component since it's lazy loaded
vi.mock('../../components/Board', () => ({
  default: ({ tableId }: { tableId: string; store: unknown }) => (
    <div data-testid="board">Board: {tableId}</div>
  ),
}));

// Mock YjsStore since it's used by the Table route (M3.6-T5)
vi.mock('../../store/YjsStore', () => ({
  YjsStore: class MockYjsStore {
    objects = new Y.Map();
    metadata = new Y.Map();
    async waitForReady() {
      return Promise.resolve();
    }
    forEachObject(_fn: (yMap: never, id: string) => void) {
      // Mock - no objects, so this function is never called
    }
    getObjectYMap(_id: string) {
      return undefined;
    }
    getObjectsSelectedBy(_actorId: string) {
      return [];
    }
    onObjectsChange(_callback: () => void) {
      return () => {};
    }
    onConnectionStatusChange(_callback: () => void) {
      return () => {};
    }
    getConnectionStatus() {
      return 'offline';
    }
    getActorId() {
      return 'test-actor-id';
    }
    setGameAssets(_assets: unknown) {}
    getGameAssets() {
      return null;
    }
    onGameAssetsChange(callback: (assets: unknown) => void) {
      // Immediately call with null
      callback(null);
      return () => {};
    }
    destroy() {}
  },
}));

describe('Table Route', () => {
  it('renders with table ID from route', async () => {
    const memoryHistory = createMemoryHistory({
      initialEntries: ['/table/happy-clever-elephant'],
    });
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      defaultPendingMinMs: 0,
    });

    await act(async () => {
      render(<RouterProvider router={router} />);
      // Wait for router to load
      await router.load();
    });

    // Wait for lazy loaded Board component
    expect(await screen.findByTestId('board')).toBeInTheDocument();
    // Check that Board component shows the table ID
    expect(
      screen.getByText(/Board: happy-clever-elephant/i),
    ).toBeInTheDocument();
  });
});
