import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { routeTree } from '../../routeTree.gen';
import * as Y from 'yjs';
import type { GameAssets, LoadableEntry } from '@cardtable2/shared';
import type * as ContentModule from '../../content';
import { setPendingLocalPlugin } from '../../content';
import {
  getLoadableEntries,
  clearLoadableEntries,
} from '../../content/loadablesRegistry';

// ---------------------------------------------------------------------------
// Shared mock state (so tests can pre-set metadata before mount)
// ---------------------------------------------------------------------------

const mockDoc = new Y.Doc();
const mockMetadata = mockDoc.getMap<unknown>('metadata');
const setGameAssetsMock = vi.fn();

// Mock the Board component since it's lazy loaded
vi.mock('../../components/Board', () => ({
  default: ({ tableId }: { tableId: string; store: unknown }) => (
    <div data-testid="board">Board: {tableId}</div>
  ),
}));

// Mock YjsStore since it's used by the Table route (M3.6-T5)
vi.mock('../../store/YjsStore', () => {
  return {
    YjsStore: class MockYjsStore {
      objects = mockDoc.getMap('objects');
      metadata = mockMetadata;
      hands = mockDoc.getMap('hands');
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
      setGameAssets(assets: unknown) {
        setGameAssetsMock(assets);
      }
      getGameAssets() {
        return null;
      }
      onGameAssetsChange(callback: (assets: unknown) => void) {
        // Immediately call with null
        callback(null);
        return () => {};
      }
      getHandIds() {
        return [];
      }
      getHandName(_handId: string) {
        return '';
      }
      getHandCards(_handId: string) {
        return [];
      }
      onHandsChange(_callback: () => void) {
        return () => {};
      }
      createHand(_name: string) {
        return 'mock-hand-id';
      }
      destroy() {}
    },
  };
});

// Mock the content module to capture loadPluginAssets calls without doing
// real network IO.
const loadPluginAssetsMock = vi.fn<(pluginId: string) => Promise<GameAssets>>();

const emptyAssets: GameAssets = {
  packs: [],
  cardTypes: {},
  cards: {},
  cardSets: {},
  tokens: {},
  counters: {},
  mats: {},
  tokenTypes: {},
  statusTypes: {},
  modifierStats: {},
  iconTypes: {},
};

vi.mock('../../content', async () => {
  const actual = await vi.importActual<typeof ContentModule>('../../content');
  return {
    ...actual,
    loadPluginAssets: (pluginId: string): Promise<GameAssets> =>
      loadPluginAssetsMock(pluginId),
  };
});

describe('Table Route', () => {
  beforeEach(() => {
    // Clear shared metadata between tests
    for (const key of Array.from(mockMetadata.keys())) {
      mockMetadata.delete(key);
    }
    setGameAssetsMock.mockClear();
    loadPluginAssetsMock.mockReset();
    loadPluginAssetsMock.mockResolvedValue(emptyAssets);
  });

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

  it('always loads plugin assets on mount when pluginId metadata is set', async () => {
    // Pre-seed pluginId metadata BEFORE mount so the mount effect sees it.
    mockMetadata.set('pluginId', 'test-plugin');

    const memoryHistory = createMemoryHistory({
      initialEntries: ['/table/eager-load-table'],
    });
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      defaultPendingMinMs: 0,
    });

    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    // Wait until Board renders (which happens after pack loading completes)
    await screen.findByTestId('board');

    expect(loadPluginAssetsMock).toHaveBeenCalledTimes(1);
    expect(loadPluginAssetsMock).toHaveBeenCalledWith('test-plugin');
    // setGameAssets called exactly once on the no-scenario happy path.
    expect(setGameAssetsMock).toHaveBeenCalledTimes(1);
    expect(setGameAssetsMock).toHaveBeenCalledWith(emptyAssets);
  });

  it('skips plugin loading when no pluginId metadata is set', async () => {
    // No pluginId set — blank table state.

    const memoryHistory = createMemoryHistory({
      initialEntries: ['/table/blank-table'],
    });
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      defaultPendingMinMs: 0,
    });

    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    await screen.findByTestId('board');

    expect(loadPluginAssetsMock).not.toHaveBeenCalled();
    expect(setGameAssetsMock).not.toHaveBeenCalled();
  });

  it('does not re-seed pluginId from navigation state when a local-dev scenario is loaded (ct-62j)', async () => {
    // Regression: the user navigated home -> Test Game (state.pluginId =
    // "testgame"), then triggered Load Plugin from Directory which cleared
    // pluginId metadata and set loadedScenario.type === "local-dev". On
    // reload, history.state still carries pluginId="testgame". The mount
    // effect must NOT re-seed pluginId from state in this case — otherwise
    // the eager `loadPluginAssets` would overwrite the local plugin assets
    // when the user re-loads it (and on this no-pluginId path it should not
    // call loadPluginAssets at all).
    mockMetadata.set('loadedScenario', {
      type: 'local-dev',
      loadedAt: Date.now(),
      scenarioName: 'My Local Scenario',
    });

    const memoryHistory = createMemoryHistory({
      initialEntries: ['/'],
    });
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      defaultPendingMinMs: 0,
    });

    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    // Navigate WITH state. This mirrors GameSelect's
    // `navigate({ to: '/table/$id', state: { pluginId } })` call. The state
    // sticks in history.state across reloads in real browsers — the mount
    // effect must not act on it when a scenario is already loaded.
    await act(async () => {
      await router.navigate({
        to: '/table/$id',
        params: { id: 'local-dev-reload' },
        state: { pluginId: 'testgame' } as Record<string, unknown>,
      });
    });

    await screen.findByTestId('board');

    // pluginId stays unset — the local-dev scenario marker locks the table
    // out of the registry-driven plugin path.
    expect(mockMetadata.get('pluginId')).toBeUndefined();
    // No plugin fetch — local-dev scenarios cannot be auto-reloaded.
    expect(loadPluginAssetsMock).not.toHaveBeenCalled();
    // No setGameAssets either — the user must re-trigger Load Plugin from
    // Directory to populate them.
    expect(setGameAssetsMock).not.toHaveBeenCalled();
  });

  it('local-dev arrival applies assets + populates loadables registry, but does NOT load a scenario (ct-7kx)', async () => {
    // Mirror the main-screen flow: user picks a local plugin directory,
    // `loadLocalPluginAssets` returns a `LoadedLocalPluginContent`, the
    // caller stashes it via `setPendingLocalPlugin`, then navigates with
    // `state.localDev = true`. The table mount effect must:
    //   - consume the stash
    //   - call store.setGameAssets with the plugin's content
    //   - populate the loadables[] runtime registry from the manifest
    //   - NOT write `loadedScenario` metadata (no scenario was loaded)
    //   - NOT call loadPluginAssets (no registered pluginId on this path)
    clearLoadableEntries();

    const loadables: LoadableEntry[] = [
      {
        type: 'scenario',
        label: 'Scenario',
        mode: 'replace',
        source: {
          kind: 'static',
          items: [
            {
              id: 'local-scenario-a',
              label: 'Local Scenario A',
              data: { file: 'a.json' },
            },
          ],
        },
      },
    ];

    setPendingLocalPlugin({
      content: emptyAssets,
      pluginManifest: {
        id: 'local-plugin',
        name: 'Local Plugin',
        version: '1.0.0',
        assets: [],
        loadables,
      },
      blobUrls: new Map(),
    });

    const memoryHistory = createMemoryHistory({ initialEntries: ['/'] });
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      defaultPendingMinMs: 0,
    });

    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });

    await act(async () => {
      await router.navigate({
        to: '/table/$id',
        params: { id: 'local-dev-fresh' },
        state: { localDev: true } as Record<string, unknown>,
      });
    });

    await screen.findByTestId('board');

    // Assets applied to the store from the pending stash.
    expect(setGameAssetsMock).toHaveBeenCalledTimes(1);
    expect(setGameAssetsMock).toHaveBeenCalledWith(emptyAssets);

    // No scenario was loaded — `loadedScenario` metadata stays empty.
    expect(mockMetadata.get('loadedScenario')).toBeUndefined();
    // Local-dev tables don't bind to a registered plugin, so pluginId is
    // never set — the mount effect skips eager plugin asset loading.
    expect(mockMetadata.get('pluginId')).toBeUndefined();
    expect(loadPluginAssetsMock).not.toHaveBeenCalled();

    // Loadables registry populated from the manifest so the unified picker /
    // per-type Load commands surface this plugin's items (ct-erb).
    const entries = getLoadableEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('scenario');

    clearLoadableEntries();
  });
});
