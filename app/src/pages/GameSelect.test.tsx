import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GameSelect from './GameSelect';
import { GamesIndex } from '../types/game';

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

describe('GameSelect', () => {
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

    render(
      <MemoryRouter>
        <GameSelect />
      </MemoryRouter>,
    );

    // Should show loading state initially
    expect(screen.getByText(/Loading games.../i)).toBeInTheDocument();

    // Wait for games to load
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

    render(
      <MemoryRouter>
        <GameSelect />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Error: Failed to load/i)).toBeInTheDocument();
    });
  });
});
