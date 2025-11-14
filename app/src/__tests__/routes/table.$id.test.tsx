import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { routeTree } from '../../routeTree.gen';

// Mock the Board component since it's lazy loaded
vi.mock('../../components/Board', () => ({
  default: ({ tableId }: { tableId: string }) => (
    <div data-testid="board">Board for {tableId}</div>
  ),
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
    render(<RouterProvider router={router} />);

    // Wait for router to load
    await router.load();

    // Wait for lazy loaded Board component
    expect(await screen.findByTestId('board')).toBeInTheDocument();
    // Check that Board component shows the table ID
    expect(
      screen.getByText(/Board for happy-clever-elephant/i),
    ).toBeInTheDocument();
  });
});
