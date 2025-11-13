import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders and loads game select', async () => {
    // Mock fetch for gamesIndex.json
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              games: [
                {
                  id: 'fake-game',
                  name: 'Fake Game',
                  description: 'Test game',
                  version: '1.0.0',
                  manifestUrl: '/games/fake-game/manifest.json',
                },
              ],
            }),
        } as Response),
      ),
    );

    render(<App />);

    // Wait for the app to load games
    await waitFor(() => {
      expect(screen.getByText(/Cardtable/i)).toBeInTheDocument();
    });
  });
});
