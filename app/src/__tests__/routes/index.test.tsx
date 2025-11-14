import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { routeTree } from '../../routeTree.gen';
import { GamesIndex } from '../../types/game';

const mockGamesIndex: GamesIndex = {
  games: [
    {
      id: 'fake-game',
      name: 'Fake Game',
      description: 'A placeholder game',
      version: '1.0.0',
      manifestUrl: '/games/fake-game/manifest.json',
    },
  ],
};

describe('Index Route (GameSelect)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays games', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGamesIndex),
        } as Response),
      ),
    );

    const memoryHistory = createMemoryHistory({ initialEntries: ['/'] });
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      defaultPendingMinMs: 0,
    });
    render(<RouterProvider router={router} />);

    // Wait for router to load
    await router.load();

    // Wait for games to load (may skip loading state)
    await waitFor(() => {
      expect(screen.getByText(/Cardtable/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Solo-first card table/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open Table/i }),
    ).toBeInTheDocument();
  });

  it('displays error when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Failed to load'))),
    );

    const memoryHistory = createMemoryHistory({ initialEntries: ['/'] });
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      defaultPendingMinMs: 0,
    });
    render(<RouterProvider router={router} />);

    // Wait for router to load
    await router.load();

    await waitFor(() => {
      expect(screen.getByText(/Error: Failed to load/i)).toBeInTheDocument();
    });
  });
});
