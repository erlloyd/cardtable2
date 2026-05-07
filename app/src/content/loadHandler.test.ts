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
import { handleLoadSelection } from './loadHandler';
import type * as ContentIndex from './index';
import * as YjsActions from '../store/YjsActions';
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
        cards: { '01001': { face: 'a.png', type: 'player' } },
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

describe('handleLoadSelection — additive + provider', () => {
  it('warns and alerts (provider runner not wired in this iteration)', async () => {
    const entry: LoadableEntry = {
      type: 'deck',
      label: 'Deck',
      mode: 'additive',
      source: {
        kind: 'provider',
        module: 'parsers/marvelcdb-deck.js',
      },
    };
    const store = makeStore({ pluginId: 'p', gameAssets: makeAssets() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleLoadSelection(entry, null, { store, getViewportState });
    expect(YjsActions.createObject).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Provider-source loadables'),
      expect.anything(),
    );
  });
});
