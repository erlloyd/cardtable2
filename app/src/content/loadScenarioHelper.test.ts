import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadScenarioContent } from './loadScenarioHelper';
import type { YjsStore } from '../store/YjsStore';
import type { LoadedContent, LoadedScenarioMetadata } from './index';
import type {
  TableObject,
  StackObject,
  LoadableEntry,
  ScenarioCounterSpawn,
} from '@cardtable2/shared';
import { COUNTER_LOADABLE_TYPE, ObjectKind } from '@cardtable2/shared';
import type { CounterMeta } from '../renderer/objects/counter/types';
import { SCENARIO_OBJECT_ADD_FAILED } from '../constants/errorIds';
import { getLoadableEntries, clearLoadableEntries } from './loadablesRegistry';

describe('loadScenarioContent', () => {
  let mockStore: YjsStore;
  let mockContent: LoadedContent;
  let mockMetadata: LoadedScenarioMetadata;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock YjsStore
    mockStore = {
      metadata: new Map(),
      setGameAssets: vi.fn(),
      setObject: vi.fn(),
    } as unknown as YjsStore;

    // Mock LoadedContent
    const mockObject1: StackObject = {
      _kind: ObjectKind.Stack,
      _containerId: 'table',
      _pos: { x: 0, y: 0, r: 0 },
      _sortKey: '1.0',
      _locked: false,
      _selectedBy: null,
      _meta: {},
      _cards: ['CARD001'],
      _faceUp: true,
    };

    const mockObject2: StackObject = {
      _kind: ObjectKind.Stack,
      _containerId: 'table',
      _pos: { x: 100, y: 100, r: 0 },
      _sortKey: '2.0',
      _locked: false,
      _selectedBy: null,
      _meta: {},
      _cards: ['CARD002'],
      _faceUp: false,
    };

    mockContent = {
      scenario: {
        schema: 'ct-scenario@2',
        id: 'test-scenario',
        name: 'Test Scenario',
        version: '1.0.0',
        packs: ['pack1'],
      },
      content: {
        packs: [],
        cardTypes: {},
        cards: {
          CARD001: {
            name: '',
            type: 'hero',
            face: '/assets/hero1.jpg',
          },
          CARD002: {
            name: '',
            type: 'villain',
            face: '/assets/villain1.jpg',
          },
        },
        cardSets: {},
        tokens: {},
        counters: {},
        mats: {},
        tokenTypes: {},
        statusTypes: {},
        modifierStats: {},
        iconTypes: {},
      },
      objects: new Map<string, TableObject>([
        ['obj1', mockObject1],
        ['obj2', mockObject2],
      ]),
    };

    mockMetadata = {
      type: 'plugin',
      pluginId: 'test-plugin',
      scenarioFile: 'scenario1.json',
      loadedAt: Date.now(),
      scenarioName: 'Test Scenario',
    };

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Use fake timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('synchronous operations', () => {
    it('should store metadata in Y.Doc', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      expect(mockStore.metadata.get('loadedScenario')).toBe(mockMetadata);
    });

    it('should call setGameAssets with content', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      expect(mockStore.setGameAssets).toHaveBeenCalledWith(mockContent.content);
      expect(mockStore.setGameAssets).toHaveBeenCalledTimes(1);
    });

    it('should log scenario loaded info', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Test] Scenario loaded:',
        expect.objectContaining({
          objectCount: 2,
          scenarioName: 'Test Scenario',
          cardCount: 2,
        }),
      );
    });

    it('should log metadata storage', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Test] Stored scenario metadata in Y.Doc',
        mockMetadata,
      );
    });

    it('should not call setObject synchronously', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      expect(mockStore.setObject).not.toHaveBeenCalled();
    });
  });

  describe('asynchronous operations', () => {
    it('should defer object addition with setTimeout', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      // Objects not added yet
      expect(mockStore.setObject).not.toHaveBeenCalled();

      // Advance timers
      vi.runAllTimers();

      // Now objects should be added
      expect(mockStore.setObject).toHaveBeenCalledTimes(2);
    });

    it('should call setObject for each object', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');
      vi.runAllTimers();

      expect(mockStore.setObject).toHaveBeenCalledWith('obj1', {
        _kind: ObjectKind.Stack,
        _containerId: 'table',
        _pos: { x: 0, y: 0, r: 0 },
        _sortKey: '1.0',
        _locked: false,
        _selectedBy: null,
        _meta: {},
        _cards: ['CARD001'],
        _faceUp: true,
      });

      expect(mockStore.setObject).toHaveBeenCalledWith('obj2', {
        _kind: ObjectKind.Stack,
        _containerId: 'table',
        _pos: { x: 100, y: 100, r: 0 },
        _sortKey: '2.0',
        _locked: false,
        _selectedBy: null,
        _meta: {},
        _cards: ['CARD002'],
        _faceUp: false,
      });
    });

    it('should log success after adding objects', () => {
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');
      vi.runAllTimers();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Test] Scenario loaded successfully',
      );
    });

    it('should handle empty object map', () => {
      const emptyContent = {
        ...mockContent,
        objects: new Map<string, TableObject>(),
      };

      loadScenarioContent(mockStore, emptyContent, mockMetadata, '[Test]');
      vi.runAllTimers();

      expect(mockStore.setObject).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Test] Scenario loaded successfully',
      );
    });
  });

  describe('error handling', () => {
    it('should catch errors during object addition', () => {
      // Make setObject throw on first call
      (mockStore.setObject as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error('Database error');
        },
      );

      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      expect(() => {
        vi.runAllTimers();
      }).toThrow('Database error');
    });

    it('should log errors with structured logging', () => {
      const testError = new Error('Database error');
      (mockStore.setObject as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw testError;
        },
      );

      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      try {
        vi.runAllTimers();
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Test] Failed to add scenario objects',
        expect.objectContaining({
          errorId: SCENARIO_OBJECT_ADD_FAILED,
          error: testError,
          objectCount: 2,
          scenarioName: 'Test Scenario',
          errorMessage: 'Database error',
        }),
      );
    });

    it('should log non-Error objects as strings', () => {
      (mockStore.setObject as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'String error';
        },
      );

      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      try {
        vi.runAllTimers();
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Test] Failed to add scenario objects',
        expect.objectContaining({
          errorId: SCENARIO_OBJECT_ADD_FAILED,
          errorMessage: 'String error',
        }),
      );
    });

    it('should re-throw errors after logging', () => {
      const testError = new Error('Database error');
      (mockStore.setObject as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw testError;
        },
      );

      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      expect(() => {
        vi.runAllTimers();
      }).toThrow(testError);
    });

    it('should stop adding objects after first error', () => {
      (mockStore.setObject as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error('First object failed');
        },
      );

      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');

      try {
        vi.runAllTimers();
      } catch {
        // Expected
      }

      // Only first object attempted
      expect(mockStore.setObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('logPrefix parameter', () => {
    it('should use custom logPrefix in all logs', () => {
      const customPrefix = '[Custom Module]';
      loadScenarioContent(mockStore, mockContent, mockMetadata, customPrefix);
      vi.runAllTimers();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `${customPrefix} Scenario loaded:`,
        expect.any(Object),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `${customPrefix} Stored scenario metadata in Y.Doc`,
        expect.any(Object),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `${customPrefix} Scenario loaded successfully`,
      );
    });

    it('should use logPrefix in error messages', () => {
      (mockStore.setObject as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error('Test error');
        },
      );

      const customPrefix = '[Error Module]';
      loadScenarioContent(mockStore, mockContent, mockMetadata, customPrefix);

      try {
        vi.runAllTimers();
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `${customPrefix} Failed to add scenario objects`,
        expect.any(Object),
      );
    });
  });

  describe('metadata types', () => {
    it('should handle plugin metadata', () => {
      const pluginMetadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'test-plugin',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Plugin Scenario',
      };

      loadScenarioContent(mockStore, mockContent, pluginMetadata, '[Test]');

      expect(mockStore.metadata.get('loadedScenario')).toBe(pluginMetadata);
    });

    it('should handle builtin metadata', () => {
      const builtinMetadata: LoadedScenarioMetadata = {
        type: 'builtin',
        scenarioUrl: 'https://example.com/scenario.json',
        loadedAt: Date.now(),
        scenarioName: 'Builtin Scenario',
      };

      loadScenarioContent(mockStore, mockContent, builtinMetadata, '[Test]');

      expect(mockStore.metadata.get('loadedScenario')).toBe(builtinMetadata);
    });

    it('should handle local-dev metadata', () => {
      const localDevMetadata: LoadedScenarioMetadata = {
        type: 'local-dev',
        loadedAt: Date.now(),
        scenarioName: 'Local Dev Scenario',
      };

      loadScenarioContent(mockStore, mockContent, localDevMetadata, '[Test]');

      expect(mockStore.metadata.get('loadedScenario')).toBe(localDevMetadata);
    });

    it('clears stale pluginId metadata when loading a local-dev scenario (ct-62j)', () => {
      // Simulate the regression scenario: a registry-driven plugin was loaded
      // first (via GameSelector navigation), seeding `pluginId`. Then the
      // user triggers Load Plugin from Directory, replacing the table's
      // gameAssets with a local plugin. Without this clear, the next mount
      // effect would re-fetch the registry plugin's assets and overwrite
      // the local-plugin gameAssets — and any objects placed against the
      // local plugin's cards would render as missing.
      mockStore.metadata.set('pluginId', 'testgame');
      const localDevMetadata: LoadedScenarioMetadata = {
        type: 'local-dev',
        loadedAt: Date.now(),
        scenarioName: 'Local Dev Scenario',
      };

      loadScenarioContent(mockStore, mockContent, localDevMetadata, '[Test]');

      expect(mockStore.metadata.has('pluginId')).toBe(false);
      expect(mockStore.metadata.get('loadedScenario')).toBe(localDevMetadata);
    });

    it('preserves pluginId metadata when loading a registry-driven plugin scenario', () => {
      // Counterpart to the local-dev clearing test. Plugin scenarios are
      // bound to the table's plugin identity by design (ct-4wk), so the
      // mount effect can re-load the plugin's assets on reload. Clearing
      // pluginId here would defeat that.
      mockStore.metadata.set('pluginId', 'testgame');
      const pluginMetadata: LoadedScenarioMetadata = {
        type: 'plugin',
        pluginId: 'testgame',
        scenarioFile: 'scenario1.json',
        loadedAt: Date.now(),
        scenarioName: 'Plugin Scenario',
      };

      loadScenarioContent(mockStore, mockContent, pluginMetadata, '[Test]');

      expect(mockStore.metadata.get('pluginId')).toBe('testgame');
    });
  });

  describe('loadables registry propagation (ct-erb)', () => {
    beforeEach(() => {
      clearLoadableEntries();
    });

    afterEach(() => {
      clearLoadableEntries();
    });

    it('populates the loadables registry when loadables are supplied (local-dev path)', () => {
      const localDevMetadata: LoadedScenarioMetadata = {
        type: 'local-dev',
        loadedAt: Date.now(),
        scenarioName: 'Local Dev Scenario',
      };
      const loadables: LoadableEntry[] = [
        {
          type: 'scenario',
          label: 'Scenario',
          mode: 'replace',
          source: {
            kind: 'static',
            items: [
              {
                typeId: 'testgame-basic',
                label: 'Test Game - Basic Setup',
                data: { file: 'testgame-basic.json' },
              },
            ],
          },
        },
        {
          type: 'card',
          label: 'Card',
          mode: 'additive',
          source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
        },
      ];

      loadScenarioContent(
        mockStore,
        mockContent,
        localDevMetadata,
        '[Test]',
        undefined,
        undefined,
        loadables,
      );

      const resolved = getLoadableEntries();
      expect(resolved).toHaveLength(2);
      expect(resolved[0].type).toBe('scenario');
      expect(resolved[1].type).toBe('card');
      // asset-pack-derived 'all-cards' should be materialized into a static
      // list keyed off mockContent.content.cards (CARD001, CARD002).
      expect(resolved[1].source.kind).toBe('static');
      if (resolved[1].source.kind === 'static') {
        expect(resolved[1].source.items.map((i) => i.typeId).sort()).toEqual([
          'CARD001',
          'CARD002',
        ]);
      }
    });

    it('clears the loadables registry when no loadables are supplied (plugin-switch leak guard)', () => {
      // Seed the registry as if a previous plugin had populated it.
      const previousLoadables: LoadableEntry[] = [
        {
          type: 'scenario',
          label: 'Scenario',
          mode: 'replace',
          source: {
            kind: 'static',
            items: [{ typeId: 'old', label: 'Old', data: {} }],
          },
        },
      ];
      loadScenarioContent(
        mockStore,
        mockContent,
        mockMetadata,
        '[Test]',
        undefined,
        undefined,
        previousLoadables,
      );
      expect(getLoadableEntries()).toHaveLength(1);

      // Subsequent load with no loadables should empty the registry.
      loadScenarioContent(mockStore, mockContent, mockMetadata, '[Test]');
      expect(getLoadableEntries()).toEqual([]);
    });
  });

  describe('typed-counter auto-spawn (ct-x41)', () => {
    function counterLoadables(): LoadableEntry[] {
      return [
        {
          type: COUNTER_LOADABLE_TYPE,
          label: 'Counter',
          mode: 'additive',
          source: {
            kind: 'static',
            items: [
              {
                typeId: 'damage',
                label: 'Damage',
                data: {
                  color: 0xf39c12,
                  text: 'DMG',
                  min: 0,
                  max: 99,
                  startingValue: 0,
                },
              },
              {
                typeId: 'threat',
                label: 'Threat',
                data: {
                  color: 0x3498db,
                  min: 0,
                  max: 20,
                  startingValue: 1,
                },
              },
            ],
          },
        },
      ];
    }

    function withCounterSpawns(
      spawns: ScenarioCounterSpawn[],
    ): typeof mockContent {
      return {
        ...mockContent,
        scenario: { ...mockContent.scenario, counters: spawns },
      };
    }

    afterEach(() => {
      clearLoadableEntries();
    });

    it('materialises scenario-declared counter spawns end-to-end (loaded objects include both spawns)', () => {
      const content = withCounterSpawns([
        {
          typeId: 'damage',
          position: { x: 10, y: 20 },
          initialValue: 5,
        },
        { typeId: 'threat' },
      ]);

      loadScenarioContent(
        mockStore,
        content,
        mockMetadata,
        '[Test]',
        undefined,
        undefined,
        counterLoadables(),
      );
      vi.runAllTimers();

      const setObject = mockStore.setObject as ReturnType<typeof vi.fn>;
      // 2 stacks + 2 counters
      expect(setObject).toHaveBeenCalledTimes(4);

      const calls = setObject.mock.calls as Array<[string, TableObject]>;
      const counterCalls = calls.filter(
        ([, obj]) => obj._kind === ObjectKind.Counter,
      );
      expect(counterCalls).toHaveLength(2);

      const counterMetas = counterCalls.map(
        ([, obj]) => obj._meta as CounterMeta,
      );
      const byTypeId = Object.fromEntries(
        counterMetas.map((m) => [m.typeId, m]),
      );
      expect(byTypeId['damage']?.currentValue).toBe(5);
      // No override → currentValue tracks the type def's startingValue (1).
      expect(byTypeId['threat']?.currentValue).toBe(1);
    });

    it('skips spawns with unknown typeId and still loads the rest of the scenario', () => {
      const content = withCounterSpawns([
        { typeId: 'nonexistent' },
        { typeId: 'damage' },
      ]);

      loadScenarioContent(
        mockStore,
        content,
        mockMetadata,
        '[Test]',
        undefined,
        undefined,
        counterLoadables(),
      );
      vi.runAllTimers();

      const setObject = mockStore.setObject as ReturnType<typeof vi.fn>;
      const calls = setObject.mock.calls as Array<[string, TableObject]>;
      const counterCalls = calls.filter(
        ([, obj]) => obj._kind === ObjectKind.Counter,
      );
      // Only one counter materialised; the unknown typeId was dropped.
      expect(counterCalls).toHaveLength(1);
      expect((counterCalls[0][1]._meta as CounterMeta).typeId).toBe('damage');

      // The error log names the scenario id and the missing typeId.
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(content.scenario.id),
        expect.objectContaining({ typeId: 'nonexistent' }),
      );
      // Stacks still loaded — 2 stacks + 1 counter = 3.
      expect(setObject).toHaveBeenCalledTimes(3);
    });

    it('no counter spawns is a no-op (scenario.counters undefined)', () => {
      loadScenarioContent(
        mockStore,
        mockContent,
        mockMetadata,
        '[Test]',
        undefined,
        undefined,
        counterLoadables(),
      );
      vi.runAllTimers();

      const setObject = mockStore.setObject as ReturnType<typeof vi.fn>;
      const calls = setObject.mock.calls as Array<[string, TableObject]>;
      const counterCalls = calls.filter(
        ([, obj]) => obj._kind === ObjectKind.Counter,
      );
      expect(counterCalls).toHaveLength(0);
    });
  });
});
