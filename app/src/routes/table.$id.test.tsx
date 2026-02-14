/* eslint-disable @typescript-eslint/no-misused-promises */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { YjsStore } from '../store/YjsStore';
import type { LoadedScenarioMetadata, LoadedContent } from '../content';
import { CONTENT_RELOAD_INVALID_METADATA } from '../constants/errorIds';

/**
 * Tests for multiplayer observer logic in table.$id.tsx
 *
 * The observer handles remote scenario loading in multiplayer sessions.
 * Key behaviors:
 * - Ignores local changes (only reacts to remote changes)
 * - Validates metadata structure
 * - Detects and discards stale scenario loads (race condition handling)
 * - Reloads scenarios when remote players trigger loads
 */
describe('table.$id.tsx - Multiplayer Observer', () => {
  let mockStore: YjsStore;
  let mockReloadScenario: ReturnType<typeof vi.fn>;
  let mockSetPacksLoading: ReturnType<typeof vi.fn>;
  let mockSetPacksError: ReturnType<typeof vi.fn>;
  let consoleLogSpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  const createMockContent = (scenarioName: string): LoadedContent => ({
    scenario: {
      schema: 'ct-scenario@1',
      id: 'test',
      name: scenarioName,
      version: '1.0.0',
      packs: [],
    },
    content: {
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
    },
    objects: new Map(),
  });

  const createObserver = (): ((
    _event: unknown,
    transaction: { local: boolean },
  ) => void) => {
    // Capture mocks with proper types to use in the returned closure
    const reloadScenario = mockReloadScenario as (
      ...args: unknown[]
    ) => Promise<LoadedContent>;
    const setPacksLoading = mockSetPacksLoading as (...args: unknown[]) => void;
    const setPacksError = mockSetPacksError as (...args: unknown[]) => void;
    const logSpy = consoleLogSpy as (...args: unknown[]) => void;
    const errorSpy = consoleErrorSpy as (...args: unknown[]) => void;
    // This simulates the observer function from table.$id.tsx (lines 168-247)
    return (_event: unknown, transaction: { local: boolean }): void => {
      if (transaction.local) return;

      const loadedScenario = mockStore.metadata.get('loadedScenario') as
        | LoadedScenarioMetadata
        | undefined;

      if (
        loadedScenario &&
        (typeof loadedScenario !== 'object' || !loadedScenario.type)
      ) {
        errorSpy('[Table] Invalid loadedScenario metadata from remote', {
          errorId: CONTENT_RELOAD_INVALID_METADATA,
          metadata: loadedScenario,
        });
        return;
      }

      if (loadedScenario && !mockStore.getGameAssets()) {
        logSpy('[Table] Remote player loaded scenario, reloading locally');
        setPacksLoading(true);
        setPacksError(null);

        const metadataTimestamp = loadedScenario.loadedAt;

        void reloadScenario(loadedScenario)
          .then((content: LoadedContent) => {
            // Capture parameter types to ensure proper inference in nested callbacks
            const log = logSpy;
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
                  loadedScenario: loadedScenario.scenarioName,
                  loadedAt: metadataTimestamp,
                  currentScenario: currentMetadata?.scenarioName,
                  currentLoadedAt: currentMetadata?.loadedAt,
                },
              );
              return;
            }

            mockStore.setGameAssets(content.content);
            log(
              '[Table] Remote scenario loaded successfully:',
              content.scenario.name,
            );
          })
          .catch((err: unknown) => {
            // Capture parameter types to ensure proper inference in nested callbacks
            const error = errorSpy;
            const setPacks = setPacksError;
            const errorMessage =
              err instanceof Error
                ? err.message
                : 'Failed to load remote scenario';
            const errorObject =
              err instanceof Error ? err : new Error(String(err));
            error('[Table] Remote scenario loading error:', {
              error: errorObject,
              errorMessage,
              metadata: loadedScenario,
            });
            setPacks(errorMessage);
          })
          .finally(() => {
            // Capture parameter types to ensure proper inference in nested callbacks
            const setLoading = setPacksLoading;
            setLoading(false);
          });
      }
    };
  };

  beforeEach(() => {
    mockStore = {
      metadata: new Map(),
      getGameAssets: vi.fn().mockReturnValue(null),
      setGameAssets: vi.fn(),
    } as unknown as YjsStore;

    mockReloadScenario = vi.fn();
    mockSetPacksLoading = vi.fn();
    mockSetPacksError = vi.fn();
    consoleLogSpy = vi.fn();
    consoleErrorSpy = vi.fn();
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
      expect(mockReloadScenario).not.toHaveBeenCalled();
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
      mockReloadScenario.mockResolvedValue(createMockContent('Test Scenario'));

      // Trigger with remote transaction
      observer(null, { local: false });

      // Should start reload
      expect(mockSetPacksLoading).toHaveBeenCalledWith(true);
      expect(mockReloadScenario).toHaveBeenCalledWith(metadata);
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
      expect(mockReloadScenario).not.toHaveBeenCalled();
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
      expect(mockReloadScenario).not.toHaveBeenCalled();
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
      mockReloadScenario.mockResolvedValue(createMockContent('Test Scenario'));

      observer(null, { local: false });

      expect(mockReloadScenario).toHaveBeenCalledWith(metadata);
    });

    it('should accept valid builtin metadata', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'builtin',
        scenarioUrl: 'https://example.com/scenario.json',
        loadedAt: Date.now(),
        scenarioName: 'Builtin Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockReloadScenario.mockResolvedValue(
        createMockContent('Builtin Scenario'),
      );

      observer(null, { local: false });

      expect(mockReloadScenario).toHaveBeenCalledWith(metadata);
    });

    it('should accept valid local-dev metadata', () => {
      const observer = createObserver();
      const metadata: LoadedScenarioMetadata = {
        type: 'local-dev',
        loadedAt: Date.now(),
        scenarioName: 'Local Dev Scenario',
      };

      mockStore.metadata.set('loadedScenario', metadata);
      mockReloadScenario.mockResolvedValue(
        createMockContent('Local Dev Scenario'),
      );

      observer(null, { local: false });

      expect(mockReloadScenario).toHaveBeenCalledWith(metadata);
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
      (mockStore.getGameAssets as ReturnType<typeof vi.fn>).mockReturnValue({
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

      observer(null, { local: false });

      // Should not reload
      expect(mockReloadScenario).not.toHaveBeenCalled();
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
      mockReloadScenario.mockResolvedValue(createMockContent('Test Scenario'));

      observer(null, { local: false });

      // Should start reload
      expect(mockSetPacksLoading).toHaveBeenCalledWith(true);
      expect(mockReloadScenario).toHaveBeenCalledWith(metadata);
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
      mockReloadScenario.mockImplementation(() => {
        // Simulate metadata changing during load
        const newMetadata: LoadedScenarioMetadata = {
          type: 'plugin',
          pluginId: 'test-plugin',
          scenarioFile: 'scenario2.json',
          loadedAt: 2000,
          scenarioName: 'New Scenario',
        };
        mockStore.metadata.set('loadedScenario', newMetadata);

        return Promise.resolve(createMockContent('Initial Scenario'));
      });

      observer(null, { local: false });

      // Wait for async operations
      await vi.waitFor(() => {
        expect(mockReloadScenario).toHaveBeenCalled();
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
      const mockContent = createMockContent('Test Scenario');
      mockReloadScenario.mockResolvedValue(mockContent);

      observer(null, { local: false });

      // Wait for async operations
      await vi.waitFor(() => {
        expect(mockReloadScenario).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockStore.setGameAssets).toHaveBeenCalledWith(
          mockContent.content,
        );
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Table] Remote scenario loaded successfully:',
        'Test Scenario',
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

      mockReloadScenario.mockImplementation(() => {
        // Metadata removed during load
        mockStore.metadata.delete('loadedScenario');
        return Promise.resolve(createMockContent('Test Scenario'));
      });

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockReloadScenario).toHaveBeenCalled();
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
      mockReloadScenario.mockRejectedValue(testError);

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockReloadScenario).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Table] Remote scenario loading error:',
          expect.objectContaining({
            error: testError,
            errorMessage: 'Network failure',
            metadata,
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
      mockReloadScenario.mockRejectedValue('String error');

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockReloadScenario).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Table] Remote scenario loading error:',
          expect.objectContaining({
            errorMessage: 'Failed to load remote scenario',
            metadata,
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
      mockReloadScenario.mockRejectedValue(new Error('Test error'));

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
      mockReloadScenario.mockResolvedValue(createMockContent('Test Scenario'));

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
      mockReloadScenario.mockResolvedValue(createMockContent('Test Scenario'));

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockReloadScenario).toHaveBeenCalled();
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

      mockReloadScenario.mockImplementation(() => {
        // Change metadata during load
        const newMetadata: LoadedScenarioMetadata = {
          ...initialMetadata,
          loadedAt: 2000,
          scenarioName: 'New Scenario',
        };
        mockStore.metadata.set('loadedScenario', newMetadata);
        return Promise.resolve(createMockContent('Initial Scenario'));
      });

      observer(null, { local: false });

      await vi.waitFor(() => {
        expect(mockReloadScenario).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockSetPacksLoading).toHaveBeenCalledWith(false);
      });
    });
  });
});
