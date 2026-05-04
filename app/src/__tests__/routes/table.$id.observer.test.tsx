import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameAssets } from '@cardtable2/shared';
import type { YjsStore } from '../../store/YjsStore';
import type { LoadedScenarioMetadata } from '../../content';
import { CONTENT_RELOAD_INVALID_METADATA } from '../../constants/errorIds';

/**
 * Tests for multiplayer observer logic in table.$id.tsx
 *
 * The observer handles remote scenario loading in multiplayer sessions.
 * Key behaviors:
 * - Ignores local changes (only reacts to remote changes)
 * - Validates metadata structure
 * - Detects and discards stale scenario loads (race condition handling)
 * - Reloads scenarios when remote players trigger loads
 *
 * NOTE: This file simulates the observer in a closure (`createObserver`) so
 * the unit tests can drive its branches deterministically without mounting
 * the route or wiring Yjs transactions. The closure mirrors the shape of the
 * production observer in `app/src/routes/table.$id.tsx`. End-to-end mount
 * coverage of the route lives in `table.$id.test.tsx` next to this file.
 */
describe('table.$id.tsx - Multiplayer Observer', () => {
  let mockStore: YjsStore;
  let mockLoadPluginAssets: ReturnType<
    typeof vi.fn<(pluginId: string) => Promise<GameAssets>>
  >;
  let mockSetPacksLoading: ReturnType<typeof vi.fn<(loading: boolean) => void>>;
  let mockSetPacksError: ReturnType<
    typeof vi.fn<(error: string | null) => void>
  >;
  let consoleLogSpy: ReturnType<
    typeof vi.fn<(message: string, context?: unknown) => void>
  >;
  let consoleErrorSpy: ReturnType<
    typeof vi.fn<(message: string, context?: unknown) => void>
  >;

  const createMockAssets = (): GameAssets => ({
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
  });

  const createObserver = (): ((
    _event: unknown,
    transaction: { local: boolean },
  ) => void) => {
    // Snapshot mocks into the closure so each test sees the post-beforeEach
    // instances (mirrors how the production observer captures store + setters
    // from its enclosing useEffect).
    const loadPluginAssets = mockLoadPluginAssets;
    const setPacksLoading = mockSetPacksLoading;
    const setPacksError = mockSetPacksError;
    const log = consoleLogSpy;
    const errorLog = consoleErrorSpy;
    // Simulates the observer function from table.$id.tsx — see the comment
    // block on the metadata-observe useEffect for behavioural detail. Both
    // the bare-pluginId path (multiplayer JOIN with empty IndexedDB) and the
    // scenario-load path converge on `loadPluginAssets(pluginId)`.
    return (_event: unknown, transaction: { local: boolean }): void => {
      if (transaction.local) return;

      // Already-loaded short-circuit
      if (mockStore.getGameAssets()) return;

      const loadedScenario = mockStore.metadata.get('loadedScenario') as
        | LoadedScenarioMetadata
        | undefined;

      if (
        loadedScenario &&
        (typeof loadedScenario !== 'object' || !loadedScenario.type)
      ) {
        errorLog('[Table] Invalid loadedScenario metadata from remote', {
          errorId: CONTENT_RELOAD_INVALID_METADATA,
          metadata: loadedScenario,
        });
        return;
      }

      // Resolve pluginId + race-check policy from the available metadata.
      let pluginId: string | undefined;
      let metadataTimestamp: number | undefined;
      let source: 'scenario' | 'pluginId';

      if (loadedScenario && loadedScenario.type === 'plugin') {
        pluginId = loadedScenario.pluginId;
        metadataTimestamp = loadedScenario.loadedAt;
        source = 'scenario';
      } else if (!loadedScenario) {
        const bare = mockStore.metadata.get('pluginId') as string | undefined;
        if (bare) {
          pluginId = bare;
          source = 'pluginId';
        } else {
          return;
        }
      } else {
        // builtin / local-dev — not handled here.
        return;
      }

      if (!pluginId) return;

      const resolvedPluginId = pluginId;

      log(
        `[Table] Remote ${source === 'scenario' ? 'scenario load' : 'pluginId arrival'}; loading plugin assets`,
        { pluginId: resolvedPluginId, source },
      );
      setPacksLoading(true);
      setPacksError(null);

      void loadPluginAssets(resolvedPluginId)
        .then((assets): void => {
          if (source === 'scenario') {
            const currentMetadata = mockStore.metadata.get('loadedScenario') as
              | LoadedScenarioMetadata
              | undefined;

            if (
              !currentMetadata ||
              currentMetadata.loadedAt !== metadataTimestamp
            ) {
              log(
                '[Table] Scenario changed during load, discarding stale assets',
                {
                  loadedScenario:
                    loadedScenario && loadedScenario.type === 'plugin'
                      ? loadedScenario.scenarioName
                      : undefined,
                  loadedAt: metadataTimestamp,
                  currentScenario: currentMetadata?.scenarioName,
                  currentLoadedAt: currentMetadata?.loadedAt,
                },
              );
              return;
            }
          }

          if (mockStore.getGameAssets()) return;
          mockStore.setGameAssets(assets);
          log('[Table] Remote plugin assets loaded:', {
            pluginId: resolvedPluginId,
            source,
          });
        })
        .catch((err: unknown): void => {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Failed to load remote scenario';
          const errorObject =
            err instanceof Error ? err : new Error(String(err));
          errorLog('[Table] Remote plugin asset loading error:', {
            error: errorObject,
            errorMessage,
            pluginId: resolvedPluginId,
            source,
            metadata: loadedScenario,
          });
          setPacksError(errorMessage);
        })
        .finally((): void => {
          setPacksLoading(false);
        });
    };
  };

  beforeEach(() => {
    mockStore = {
      metadata: new Map(),
      getGameAssets: vi.fn().mockReturnValue(null),
      setGameAssets: vi.fn(),
    } as unknown as YjsStore;

    mockLoadPluginAssets = vi.fn<(pluginId: string) => Promise<GameAssets>>();
    mockSetPacksLoading = vi.fn<(loading: boolean) => void>();
    mockSetPacksError = vi.fn<(error: string | null) => void>();
    consoleLogSpy = vi.fn<(message: string, context?: unknown) => void>();
    consoleErrorSpy = vi.fn<(message: string, context?: unknown) => void>();
  });

  describe('transaction filtering', () => {
    it('should ignore local transactions', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);

      // Trigger with local transaction
      observer(null, { local: true });

      // Should not reload
      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
      expect(mockSetPacksLoading).not.toHaveBeenCalled();
    });

    it('should process remote transactions', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      // Trigger with remote transaction
      observer(null, { local: false });

      // Should start reload — production calls loadPluginAssets(pluginId).
      expect(mockSetPacksLoading).toHaveBeenCalledWith(true);
      expect(mockLoadPluginAssets).toHaveBeenCalledWith('test-plugin');
    });
  });

  describe('metadata validation', () => {
    it('should reject non-object metadata', () => {
      const observer = createObserver();

      // Store invalid metadata (string instead of object)
      mockStore.metadata.set(
        'loadedScenario',
        'invalid' as unknown as LoadedScenarioMetadata,
      );

      observer(null, { local: false });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Table] Invalid loadedScenario metadata from remote',
        expect.objectContaining({
          errorId: CONTENT_RELOAD_INVALID_METADATA,
          metadata: 'invalid',
        }),
      );
      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
    });

    it('should reject metadata without type field', () => {
      const observer = createObserver();

      // Store metadata missing type field
      mockStore.metadata.set('loadedScenario', {
        scenarioName: 'Test',
      } as unknown as LoadedScenarioMetadata);

      observer(null, { local: false });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Table] Invalid loadedScenario metadata from remote',
        expect.objectContaining({
          errorId: CONTENT_RELOAD_INVALID_METADATA,
        }),
      );
      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
    });

    it('should accept valid plugin metadata', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      observer(null, { local: false });

      expect(mockLoadPluginAssets).toHaveBeenCalledWith('test-plugin');
    });

    it('should ignore builtin metadata (not reachable in app code)', () => {
      // The observer intentionally only handles `type: 'plugin'`. The
      // 'builtin' branch is unused by app code (see source comment).
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'builtin',
        scenarioUrl: 'https://example.com/scenario.json',
        loadedAt: Date.now(),
        scenarioName: 'Builtin Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      observer(null, { local: false });

      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
      expect(mockSetPacksLoading).not.toHaveBeenCalled();
    });

    it('should ignore local-dev metadata (not reloadable without user action)', () => {
      // Same as above: 'local-dev' cannot be reloaded without user
      // interaction, so the observer must not auto-load.
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'local-dev',
        loadedAt: Date.now(),
        scenarioName: 'Local Dev Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      observer(null, { local: false });

      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
      expect(mockSetPacksLoading).not.toHaveBeenCalled();
    });
  });

  describe('gameAssets check', () => {
    it('should skip reload if gameAssets already exist', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);

      // Mock store already has gameAssets
      (mockStore.getGameAssets as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockAssets(),
      );

      observer(null, { local: false });

      // Should not reload
      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
      expect(mockSetPacksLoading).not.toHaveBeenCalled();
    });

    it('should reload if gameAssets do not exist', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      observer(null, { local: false });

      // Should start reload
      expect(mockSetPacksLoading).toHaveBeenCalledWith(true);
      expect(mockLoadPluginAssets).toHaveBeenCalledWith('test-plugin');
    });
  });

  // ct-c69: bare-pluginId arrival without a loadedScenario.
  //
  // Multiplayer JOIN scenario: Player A creates a fresh table for plugin X
  // (writes only `pluginId` to metadata, no scenario). Player B opens the
  // same URL with empty IndexedDB. B's mount effect early-returns (no
  // pluginId at hydrate time), then WebSocket syncs the bare `pluginId` in
  // remotely. Without the unified observer, B never loads plugin assets.
  describe('bare pluginId path (multiplayer JOIN, ct-c69)', () => {
    it('should load assets when only pluginId is present (no loadedScenario)', async () => {
      const observer = createObserver();

      // Simulate the metadata state after a remote bare-pluginId write:
      // pluginId present, loadedScenario absent.
      mockStore.metadata.set('pluginId', 'test-plugin');

      const mockAssets = createMockAssets();
      mockLoadPluginAssets.mockResolvedValue(mockAssets);

      observer(null, { local: false });

      expect(mockSetPacksLoading).toHaveBeenCalledWith(true);

      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalledWith('test-plugin');
      });

      await vi.waitFor(() => {
        expect(mockStore.setGameAssets).toHaveBeenCalledWith(mockAssets);
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Table] Remote plugin assets loaded:',
        expect.objectContaining({
          pluginId: 'test-plugin',
          source: 'pluginId',
        }),
      );
    });

    it('should skip the stale-load race-check on the bare-pluginId path', async () => {
      const observer = createObserver();

      mockStore.metadata.set('pluginId', 'test-plugin');

      // If a scenario load lands during the bare-pluginId fetch, the bare
      // path must NOT discard the asset just because loadedScenario appeared
      // — there's no `loadedAt` to race against; pluginId is set-once.
      const mockAssets = createMockAssets();
      mockLoadPluginAssets.mockImplementation(
        (_pluginId: string): Promise<GameAssets> => {
          const lateMeta: LoadedScenarioMetadata = {
            type: 'plugin',
            pluginId: 'test-plugin',
            scenarioFile: 's.json',
            loadedAt: 9999,
            scenarioName: 'Late Scenario',
          };
          mockStore.metadata.set('loadedScenario', lateMeta);
          return Promise.resolve(mockAssets);
        },
      );

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalledWith('test-plugin');
      });

      await vi.waitFor(() => {
        expect(mockStore.setGameAssets).toHaveBeenCalledWith(mockAssets);
      });

      // No "discarding stale" log on the bare path.
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        '[Table] Scenario changed during load, discarding stale assets',
        expect.anything(),
      );
    });

    it('should noop when neither loadedScenario nor pluginId is present', () => {
      const observer = createObserver();

      // Empty metadata — neither key set.
      observer(null, { local: false });

      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
      expect(mockSetPacksLoading).not.toHaveBeenCalled();
    });

    it('should prefer loadedScenario over bare pluginId when both are present', () => {
      const observer = createObserver();
      const scenario: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'scenario-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', scenario);
      mockStore.metadata.set('pluginId', 'bare-plugin');
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      observer(null, { local: false });

      // Scenario path is taken — note 'scenario-plugin', not 'bare-plugin'.
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('scenario load'),
        expect.objectContaining({ pluginId: 'scenario-plugin' }),
      );
      expect(mockLoadPluginAssets).toHaveBeenCalledWith('scenario-plugin');
    });

    it('should skip when pluginId is empty string', () => {
      const observer = createObserver();

      mockStore.metadata.set('pluginId', '');

      observer(null, { local: false });

      expect(mockLoadPluginAssets).not.toHaveBeenCalled();
      expect(mockSetPacksLoading).not.toHaveBeenCalled();
    });
  });

  describe('race condition handling', () => {
    it('should detect stale scenario and discard assets', async () => {
      const observer = createObserver();
      const initialMetadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: 1000,
        scenarioName: 'Initial Scenario',
      };

      mockStore.metadata.set('loadedScenario', initialMetadata);

      // Mock delayed reload
      mockLoadPluginAssets.mockImplementation(
        (_pluginId: string): Promise<GameAssets> => {
          // Simulate metadata changing during load
          const newMetadata: LoadedScenarioMetadata = {
            type: 'plugin',
            pluginId: 'test-plugin',
            scenarioFile: 'scenario2.json',
            loadedAt: 2000,
            scenarioName: 'New Scenario',
          };
          mockStore.metadata.set('loadedScenario', newMetadata);

          return Promise.resolve(createMockAssets());
        },
      );

      observer(null, { local: false });

      // Wait for async operations
      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalled();
      });

      // Assets should be discarded due to timestamp mismatch
      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[Table] Scenario changed during load, discarding stale assets',
          expect.objectContaining({
            loadedScenario: 'Initial Scenario',
            loadedAt: 1000,
            currentScenario: 'New Scenario',
            currentLoadedAt: 2000,
          }),
        );
      });

      expect(mockStore.setGameAssets).not.toHaveBeenCalled();
    });

    it('should set gameAssets if timestamp still matches', async () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      const mockAssets = createMockAssets();
      mockLoadPluginAssets.mockResolvedValue(mockAssets);

      observer(null, { local: false });

      // Wait for async operations
      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockStore.setGameAssets).toHaveBeenCalledWith(mockAssets);
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Table] Remote plugin assets loaded:',
        expect.objectContaining({
          pluginId: 'test-plugin',
          source: 'scenario',
        }),
      );
    });

    it('should discard if metadata removed during load', async () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);

      mockLoadPluginAssets.mockImplementation(
        (_pluginId: string): Promise<GameAssets> => {
          // Metadata removed during load
          mockStore.metadata.delete('loadedScenario');
          return Promise.resolve(createMockAssets());
        },
      );

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[Table] Scenario changed during load, discarding stale assets',
          expect.anything(),
        );
      });

      expect(mockStore.setGameAssets).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch and log reload errors', async () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);

      const testError = new Error('Network failure');
      mockLoadPluginAssets.mockRejectedValue(testError);

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Table] Remote plugin asset loading error:',
          expect.objectContaining({
            error: testError,
            errorMessage: 'Network failure',
            metadata,
            pluginId: 'test-plugin',
            source: 'scenario',
          }),
        );
      });

      expect(mockSetPacksError).toHaveBeenCalledWith('Network failure');
    });

    it('should handle non-Error rejections', async () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockRejectedValue('String error');

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Table] Remote plugin asset loading error:',
          expect.objectContaining({
            errorMessage: 'Failed to load remote scenario',
            metadata,
            pluginId: 'test-plugin',
            source: 'scenario',
          }),
        );
      });

      expect(mockSetPacksError).toHaveBeenCalledWith(
        'Failed to load remote scenario',
      );
    });

    it('should always reset loading state after error', async () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockRejectedValue(new Error('Test error'));

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockSetPacksLoading).toHaveBeenCalledWith(true);
      });

      await vi.waitFor(() => {
        expect(mockSetPacksLoading).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('loading states', () => {
    it('should set loading true when starting reload', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      observer(null, { local: false });

      expect(mockSetPacksLoading).toHaveBeenCalledWith(true);
      expect(mockSetPacksError).toHaveBeenCalledWith(null);
    });

    it('should set loading false after successful reload', async () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Test Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockLoadPluginAssets.mockResolvedValue(createMockAssets());

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockSetPacksLoading).toHaveBeenCalledWith(false);
      });
    });

    it('should set loading false even when assets are discarded', async () => {
      const observer = createObserver();
      const initialMetadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: 1000,
        scenarioName: 'Initial Scenario',
      };

      mockStore.metadata.set('loadedScenario', initialMetadata);

      mockLoadPluginAssets.mockImplementation(
        (_pluginId: string): Promise<GameAssets> => {
          // Change metadata during load
          const newMetadata: LoadedScenarioMetadata = {
            ...initialMetadata,
            loadedAt: 2000,
            scenarioName: 'New Scenario',
          };
          mockStore.metadata.set('loadedScenario', newMetadata);
          return Promise.resolve(createMockAssets());
        },
      );

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockLoadPluginAssets).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockSetPacksLoading).toHaveBeenCalledWith(false);
      });
    });
  });
});
