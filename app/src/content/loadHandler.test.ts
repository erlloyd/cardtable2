/**
 * Unit tests for the picker selection handler (ct-8gf.5).
 *
 * Scope: pure routing logic. The scenario-load arm is exercised by mocking
 * the scenario-fetch helpers; the additive arms by spying on `createObject`
 * and asserting the position came from the placement primitive.
 *
 * Network-touching code paths (loadPlugin / loadPluginAssets / etc.) are
 * mocked at the module boundary so this remains a pure unit test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GameAssets,
  LoadableEntry,
  TableObject,
} from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import {
  coerceProviderSourceToApiImport,
  handleLoadSelection,
  setProviderInputProvider,
  type ProviderInputProvider,
} from './loadHandler';
import type * as ContentIndex from './index';
import * as YjsActions from '../store/YjsActions';
import * as DeckImportEngine from './DeckImportEngine';
import type { YjsStore } from '../store/YjsStore';
import type { ViewportState } from '../utils/viewportPlacement';

// Mock the scenario-load module so we don't hit real plugin network paths.
vi.mock('./index', async () => {
  const actual = await vi.importActual<typeof ContentIndex>('./index');
  return {
    ...actual,
    loadPlugin: vi.fn((pluginId: string) =>
      Promise.resolve({
        registry: { id: pluginId, baseUrl: '/test/' },
        manifest: {
          id: pluginId,
          name: 'Test',
          version: '1.0.0',
          assets: [],
          scenarios: [],
          componentSets: [],
        },
      }),
    ),
    loadPluginAssets: vi.fn(() => Promise.resolve(makeAssets())),
    loadScenarioFromPlugin: vi.fn(
      (_pluginId: string, scenarioFile: string, content: GameAssets) =>
        Promise.resolve({
          scenario: { name: `scenario:${scenarioFile}`, packs: [] },
          content,
          objects: new Map<string, TableObject>(),
        }),
    ),
  };
});

vi.mock('./loadScenarioHelper', () => ({
  loadScenarioContent: vi.fn(),
}));

function makeAssets(overrides: Partial<GameAssets> = {}): GameAssets {
  return {
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
    ...overrides,
  };
}

function makeStore(opts: {
  pluginId?: string;
  gameAssets?: GameAssets | null;
}): YjsStore {
  const metadataMap = new Map<string, unknown>();
  if (opts.pluginId) metadataMap.set('pluginId', opts.pluginId);
  return {
    metadata: {
      get: (key: string) => metadataMap.get(key),
      set: (key: string, value: unknown) => metadataMap.set(key, value),
      delete: (key: string) => metadataMap.delete(key),
    },
    getGameAssets: () => opts.gameAssets ?? null,
    setGameAssets: vi.fn(),
    setObject: vi.fn(),
    forEachObject: vi.fn(),
    clearAllObjects: vi.fn(),
  } as unknown as YjsStore;
}

const NEUTRAL_VIEWPORT: ViewportState = {
  cameraX: 0,
  cameraY: 0,
  cameraScale: 1,
  viewportWidth: 1000,
  viewportHeight: 800,
};

const getViewportState = () => Promise.resolve(NEUTRAL_VIEWPORT);

beforeEach(() => {
  vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
  vi.spyOn(YjsActions, 'createObject').mockReturnValue('mock-id');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleLoadSelection — replace + scenario', () => {
  const scenarioEntry: LoadableEntry = {
    type: 'scenario',
    label: 'Scenario',
    mode: 'replace',
    source: { kind: 'static', items: [] },
  };

  it('routes scenario items through loadScenarioByFile', async () => {
    const store = makeStore({
      pluginId: 'testgame',
      gameAssets: makeAssets(),
    });
    const item = {
      id: 's1',
      label: 'Test',
      data: { file: 'testgame-basic.json' },
    };
    await handleLoadSelection(scenarioEntry, item, {
      store,
      getViewportState,
    });
    const helper = await import('./loadScenarioHelper');
    expect(helper.loadScenarioContent).toHaveBeenCalledTimes(1);
  });

  it('clears existing objects before loading the new scenario (ct-5ee)', async () => {
    const store = makeStore({
      pluginId: 'testgame',
      gameAssets: makeAssets(),
    });
    const helper = await import('./loadScenarioHelper');
    // Reset accumulated call history from sibling tests in this file (the
    // helper mock is module-level, set up via vi.mock at the top).
    vi.mocked(helper.loadScenarioContent).mockClear();
    // Track the call order between clearAllObjects and loadScenarioContent.
    const callOrder: string[] = [];
    vi.mocked(store.clearAllObjects).mockImplementation(() => {
      callOrder.push('clearAllObjects');
    });
    vi.mocked(helper.loadScenarioContent).mockImplementation(() => {
      callOrder.push('loadScenarioContent');
    });

    await handleLoadSelection(
      scenarioEntry,
      { id: 's1', label: 'Test', data: { file: 'testgame-basic.json' } },
      { store, getViewportState },
    );

    expect(store.clearAllObjects).toHaveBeenCalledTimes(1);
    expect(helper.loadScenarioContent).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['clearAllObjects', 'loadScenarioContent']);
  });

  it('warns and no-ops when item is null', async () => {
    const store = makeStore({ pluginId: 'p' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleLoadSelection(scenarioEntry, null, { store, getViewportState });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('null item'));
  });

  it('warns when scenario item is missing the `file` field', async () => {
    const store = makeStore({ pluginId: 'p' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleLoadSelection(
      scenarioEntry,
      { id: 'x', label: 'x', data: {} },
      { store, getViewportState },
    );
    expect(warn).toHaveBeenCalled();
  });
});

describe('handleLoadSelection — replace + non-scenario', () => {
  it('warns + alerts on unsupported replace types', async () => {
    const entry: LoadableEntry = {
      type: 'deck',
      label: 'Deck',
      mode: 'replace',
      source: { kind: 'static', items: [] },
    };
    const store = makeStore({ pluginId: 'p', gameAssets: makeAssets() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleLoadSelection(
      entry,
      { id: 'x', label: 'x', data: {} },
      { store, getViewportState },
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Replace mode is only supported'),
    );
  });
});

describe('handleLoadSelection — additive + card', () => {
  const cardEntry: LoadableEntry = {
    type: 'card',
    label: 'Card',
    mode: 'additive',
    source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
  };

  it('creates a stack-of-1 with the chosen card code', async () => {
    const store = makeStore({
      pluginId: 'p',
      gameAssets: makeAssets({
        cards: { '01001': { name: '', face: 'a.png', type: 'player' } },
      }),
    });
    await handleLoadSelection(
      cardEntry,
      { id: '01001', label: '01001', data: { code: '01001' } },
      { store, getViewportState },
    );
    expect(YjsActions.createObject).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(YjsActions.createObject).mock.calls[0][1];
    expect(opts.kind).toBe(ObjectKind.Stack);
    expect(opts.cards).toEqual(['01001']);
    // viewport center is (500,400) before jitter; jitter is bounded by
    // DEFAULT_JITTER_RADIUS (50). Using the placement primitive directly
    // ensures we landed within (500±50, 400±50).
    const pos = opts.pos;
    expect(pos.x).toBeGreaterThanOrEqual(450);
    expect(pos.x).toBeLessThanOrEqual(550);
    expect(pos.y).toBeGreaterThanOrEqual(350);
    expect(pos.y).toBeLessThanOrEqual(450);
    expect(pos.r).toBe(0);
  });

  it('warns when gameAssets are not loaded', async () => {
    const store = makeStore({ pluginId: 'p', gameAssets: null });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleLoadSelection(
      cardEntry,
      { id: '01001', label: 'x', data: { code: '01001' } },
      { store, getViewportState },
    );
    expect(YjsActions.createObject).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });
});

describe('handleLoadSelection — additive + card-set', () => {
  it('expands cardSet entries (with counts) into a multi-card stack', async () => {
    const store = makeStore({
      pluginId: 'p',
      gameAssets: makeAssets({
        cardSets: {
          'encounter-basic': ['01001', { code: '01002', count: 2 }, '01003'],
        },
      }),
    });
    const entry: LoadableEntry = {
      type: 'encounter-set',
      label: 'Encounter',
      mode: 'additive',
      source: { kind: 'asset-pack-derived', derivation: 'all-card-sets' },
    };
    await handleLoadSelection(
      entry,
      {
        id: 'encounter-basic',
        label: 'encounter-basic',
        data: { setName: 'encounter-basic' },
      },
      { store, getViewportState },
    );
    const opts = vi.mocked(YjsActions.createObject).mock.calls[0][1];
    expect(opts.cards).toEqual(['01001', '01002', '01002', '01003']);
  });

  it('also accepts the static-shape `cardSet` field', async () => {
    const store = makeStore({
      pluginId: 'p',
      gameAssets: makeAssets({
        cardSets: { 'encounter-basic': ['01025', '01026'] },
      }),
    });
    const entry: LoadableEntry = {
      type: 'encounter-set',
      label: 'Encounter',
      mode: 'additive',
      source: { kind: 'static', items: [] },
    };
    await handleLoadSelection(
      entry,
      {
        id: 'encounter-basic',
        label: 'Encounter Basic',
        data: { cardSet: 'encounter-basic' },
      },
      { store, getViewportState },
    );
    const opts = vi.mocked(YjsActions.createObject).mock.calls[0][1];
    expect(opts.cards).toEqual(['01025', '01026']);
  });

  it('warns when the cardSet is missing from gameAssets', async () => {
    const store = makeStore({ pluginId: 'p', gameAssets: makeAssets() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry: LoadableEntry = {
      type: 'encounter-set',
      label: 'Encounter',
      mode: 'additive',
      source: { kind: 'static', items: [] },
    };
    await handleLoadSelection(
      entry,
      { id: 'x', label: 'x', data: { cardSet: 'unknown' } },
      { store, getViewportState },
    );
    expect(YjsActions.createObject).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});

describe('coerceProviderSourceToApiImport', () => {
  it('translates the MC-style provider config into PluginApiImport', () => {
    const result = coerceProviderSourceToApiImport({
      kind: 'provider',
      module: 'deckImport.js',
      config: {
        apiEndpoints: {
          public: 'https://example.com/public/{deckId}',
          private: 'https://example.com/private/{deckId}',
        },
        labels: {
          siteName: 'TestDB',
          inputPlaceholder: 'Enter deck ID',
        },
      },
    });
    expect(result).toEqual({
      apiEndpoints: {
        public: 'https://example.com/public/{deckId}',
        private: 'https://example.com/private/{deckId}',
      },
      parserModule: 'deckImport.js',
      labels: {
        siteName: 'TestDB',
        inputPlaceholder: 'Enter deck ID',
      },
    });
  });

  it('omits the private endpoint when not declared', () => {
    const result = coerceProviderSourceToApiImport({
      kind: 'provider',
      module: 'p.js',
      config: {
        apiEndpoints: { public: 'https://x/{deckId}' },
        labels: { siteName: 'X', inputPlaceholder: 'p' },
      },
    });
    expect(result).not.toBeNull();
    expect(result?.apiEndpoints.private).toBeUndefined();
  });

  it('returns null when the config is missing required fields', () => {
    expect(
      coerceProviderSourceToApiImport({
        kind: 'provider',
        module: 'p.js',
        config: { apiEndpoints: { public: 'https://x' } },
      }),
    ).toBeNull();
    expect(
      coerceProviderSourceToApiImport({
        kind: 'provider',
        module: 'p.js',
      }),
    ).toBeNull();
  });
});

describe('handleLoadSelection — additive + provider', () => {
  const providerEntry: LoadableEntry = {
    type: 'deck',
    label: 'Deck',
    mode: 'additive',
    source: {
      kind: 'provider',
      module: 'deckImport.js',
      config: {
        apiEndpoints: { public: 'https://x/{deckId}' },
        labels: { siteName: 'TestDB', inputPlaceholder: 'Enter deck ID' },
      },
    },
  };

  let restoreProvider: ProviderInputProvider | null = null;

  afterEach(() => {
    if (restoreProvider) {
      setProviderInputProvider(restoreProvider);
      restoreProvider = null;
    }
  });

  it('coerces config, prompts the user, runs importFromApi, and offsets objects to viewport center', async () => {
    const store = makeStore({ pluginId: 'p', gameAssets: makeAssets() });
    restoreProvider = setProviderInputProvider(() => Promise.resolve('12345'));
    const importSpy = vi
      .spyOn(DeckImportEngine, 'importFromApi')
      .mockResolvedValue({
        objectCount: 1,
        objects: new Map<string, TableObject>([
          [
            'cs-1',
            {
              _kind: ObjectKind.Stack,
              _containerId: null,
              _pos: { x: 10, y: 20, r: 0 },
              _sortKey: '000001',
              _locked: false,
              _selectedBy: null,
              _meta: {},
              _cards: ['01001'],
              _faceUp: true,
            } as TableObject,
          ],
        ]),
      });

    await handleLoadSelection(providerEntry, null, {
      store,
      getViewportState,
    });

    expect(importSpy).toHaveBeenCalledTimes(1);
    const call = importSpy.mock.calls[0][0];
    expect(call.deckId).toBe('12345');
    expect(call.apiImport.parserModule).toBe('deckImport.js');
    expect(call.apiImport.apiEndpoints.public).toBe('https://x/{deckId}');

    // setObject should be called once with the translated position. Center
    // (500, 400), jitter ≤ 50 → final lands at (~510, ~420) ± jitter range.
    expect(store.setObject).toHaveBeenCalledTimes(1);
    const setCall = vi.mocked(store.setObject).mock.calls[0];
    const placedObj = setCall[1];
    expect(placedObj._pos.x).toBeGreaterThanOrEqual(460);
    expect(placedObj._pos.x).toBeLessThanOrEqual(560);
    expect(placedObj._pos.y).toBeGreaterThanOrEqual(370);
    expect(placedObj._pos.y).toBeLessThanOrEqual(470);
  });

  it('aborts when the user cancels the prompt', async () => {
    const store = makeStore({ pluginId: 'p', gameAssets: makeAssets() });
    restoreProvider = setProviderInputProvider(() => Promise.resolve(null));
    const importSpy = vi.spyOn(DeckImportEngine, 'importFromApi');

    await handleLoadSelection(providerEntry, null, {
      store,
      getViewportState,
    });

    expect(importSpy).not.toHaveBeenCalled();
    expect(store.setObject).not.toHaveBeenCalled();
  });

  it('alerts and bails when provider config is invalid', async () => {
    const store = makeStore({ pluginId: 'p', gameAssets: makeAssets() });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badEntry: LoadableEntry = {
      type: 'deck',
      label: 'Deck',
      mode: 'additive',
      source: { kind: 'provider', module: 'deckImport.js' },
    };

    await handleLoadSelection(badEntry, null, { store, getViewportState });

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('Provider source missing'),
      expect.anything(),
    );
  });

  it('alerts when importFromApi returns an error', async () => {
    const store = makeStore({ pluginId: 'p', gameAssets: makeAssets() });
    restoreProvider = setProviderInputProvider(() => Promise.resolve('999'));
    vi.spyOn(DeckImportEngine, 'importFromApi').mockResolvedValue({
      error: 'API returned 404',
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleLoadSelection(providerEntry, null, {
      store,
      getViewportState,
    });

    expect(store.setObject).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('Provider import failed'),
      expect.anything(),
    );
  });
});
