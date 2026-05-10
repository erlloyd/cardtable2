import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { routeTree } from '../../routeTree.gen';
import type { PluginRegistry } from '../../content/pluginLoader';
import { DEV_MODE_STORAGE_KEY } from '../../hooks/useDevMode';

const mockPluginRegistry: PluginRegistry = {
  plugins: [
    {
      id: 'fake-game',
      name: 'Fake Game',
      author: 'Test Author',
      description: 'A placeholder game',
      baseUrl: '/plugins/fake-game/',
      boxArt: '/plugins/fake-game/box-art.jpg',
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
        json: () => Promise.resolve(mockPluginRegistry),
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
          json: () => Promise.resolve(mockPluginRegistry),
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

  it('clicking a game card navigates to /table/$id', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPluginRegistry),
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
        screen.getByRole('button', { name: 'Select Fake Game' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Select Fake Game' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/table\//);
    });
  });

  describe('local-directory button visibility (ct-824)', () => {
    beforeEach(() => {
      window.localStorage.clear();
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPluginRegistry),
          } as Response),
        ),
      );
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      window.localStorage.clear();
    });

    const renderRoute = async () => {
      const router = createTestRouter();
      await act(async () => {
        render(<RouterProvider router={router} />);
        await router.load();
      });
      // Wait until the games list has rendered — the local-dir button
      // lives in the same `<main>` and only appears once the registry
      // resolves.
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Select Fake Game' }),
        ).toBeInTheDocument();
      });
    };

    it('shows the local-directory button in Vite DEV mode by default', async () => {
      vi.stubEnv('DEV', true);
      await renderRoute();
      expect(
        screen.getByRole('button', { name: /Load from local directory/i }),
      ).toBeInTheDocument();
    });

    it('hides the local-directory button outside DEV when no dev-mode is persisted', async () => {
      vi.stubEnv('DEV', false);
      await renderRoute();
      expect(
        screen.queryByRole('button', { name: /Load from local directory/i }),
      ).not.toBeInTheDocument();
    });

    it('shows the local-directory button outside DEV when dev-mode is persisted', async () => {
      vi.stubEnv('DEV', false);
      window.localStorage.setItem(DEV_MODE_STORAGE_KEY, 'true');
      await renderRoute();
      expect(
        screen.getByRole('button', { name: /Load from local directory/i }),
      ).toBeInTheDocument();
    });

    it('shows the "dev" indicator only when revealed via persisted dev-mode (not in DEV)', async () => {
      vi.stubEnv('DEV', false);
      window.localStorage.setItem(DEV_MODE_STORAGE_KEY, 'true');
      await renderRoute();
      expect(screen.getByLabelText('dev mode')).toBeInTheDocument();
    });

    it('does not show the "dev" indicator when in Vite DEV mode', async () => {
      vi.stubEnv('DEV', true);
      await renderRoute();
      // Button is visible, indicator is not — the button itself signals "dev".
      expect(
        screen.getByRole('button', { name: /Load from local directory/i }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('dev mode')).not.toBeInTheDocument();
    });
  });
});
