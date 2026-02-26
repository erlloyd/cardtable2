import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
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

// Two games — neither is auto-selected, so the launch button starts disabled
const mockMultiGamesIndex: GamesIndex = {
  games: [
    {
      id: 'fake-game',
      name: 'Fake Game',
      description: 'A placeholder game',
      version: '1.0.0',
      manifestUrl: '/games/fake-game/manifest.json',
    },
    {
      id: 'test-game',
      name: 'Test Game',
      description: 'Another test game',
      version: '1.0.0',
      manifestUrl: '/games/test-game/manifest.json',
    },
  ],
};

function createTestRouter() {
  const memoryHistory = createMemoryHistory({ initialEntries: ['/'] });
  return createRouter({
    routeTree,
    history: memoryHistory,
    defaultPendingMinMs: 0,
  });
}

describe('Index Route (GameSelect)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton loading state initially', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ); // never resolves

    const router = createTestRouter();
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<RouterProvider router={router} />));
      await router.load();
    });

    expect(container.querySelector('.skeleton--logo')).toBeInTheDocument();
    expect(container.querySelector('.skeleton-panel')).toBeInTheDocument();
    expect(container.querySelector('.skeleton--button')).toBeInTheDocument();
  });

  it('shows error panel when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error'))),
    );

    const router = createTestRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    await waitFor(() => {
      expect(screen.getByText('Could not load games')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /Try again/i }),
    ).toBeInTheDocument();
  });

  it('retry button re-fetches games', async () => {
    const user = userEvent.setup();
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGamesIndex),
      } as Response);

    vi.stubGlobal('fetch', mockFetch);

    const router = createTestRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Try again/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Try again/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Select Fake Game' }),
      ).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('shows hero section with title "Cardtable"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGamesIndex),
        } as Response),
      ),
    );

    const router = createTestRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Cardtable' }),
      ).toBeInTheDocument();
    });
  });

  it('launch button is disabled when no game is selected', async () => {
    // With 2+ games, none are auto-selected, so the button starts disabled
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMultiGamesIndex),
        } as Response),
      ),
    );

    const router = createTestRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Select a game to continue' }),
      ).toBeDisabled();
    });
  });

  it('launch button is enabled when a game is selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGamesIndex),
        } as Response),
      ),
    );

    const router = createTestRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Open table for Fake Game' }),
      ).not.toBeDisabled();
    });
  });
});
