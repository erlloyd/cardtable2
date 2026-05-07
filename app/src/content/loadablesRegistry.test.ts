import { describe, it, expect, beforeEach } from 'vitest';
import type { Card, GameAssets, LoadableEntry } from '@cardtable2/shared';
import {
  setLoadableEntries,
  getLoadableEntries,
  clearLoadableEntries,
} from './loadablesRegistry';

function createGameAssets(overrides: Partial<GameAssets> = {}): GameAssets {
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

function makeCard(face: string, type = 'player'): Card {
  return { face, type };
}

describe('loadablesRegistry', () => {
  beforeEach(() => {
    clearLoadableEntries();
  });

  it('starts empty', () => {
    expect(getLoadableEntries()).toEqual([]);
  });

  it('passes static-source entries through unchanged', () => {
    const entry: LoadableEntry<{ file: string }> = {
      type: 'scenario',
      label: 'Scenario',
      mode: 'replace',
      source: {
        kind: 'static',
        items: [
          { id: 's1', label: 'Scenario One', data: { file: 'one.json' } },
          { id: 's2', label: 'Scenario Two', data: { file: 'two.json' } },
        ],
      },
    };

    setLoadableEntries([entry], createGameAssets());

    const resolved = getLoadableEntries();
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual(entry);
  });

  it('stores provider-source config without producing items', () => {
    const entry: LoadableEntry = {
      type: 'deck',
      label: 'Deck',
      mode: 'additive',
      source: {
        kind: 'provider',
        module: 'deckImport.js',
        config: { siteName: 'MarvelCDB' },
      },
    };

    setLoadableEntries([entry], createGameAssets());

    const resolved = getLoadableEntries();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].source).toEqual({
      kind: 'provider',
      module: 'deckImport.js',
      config: { siteName: 'MarvelCDB' },
    });
  });

  it('derives all-cards items from the merged asset packs', () => {
    const assets = createGameAssets({
      cards: {
        '01001': makeCard('one.png'),
        '01002': makeCard('two.png'),
        '02001': makeCard('three.png'),
      },
    });

    const entry: LoadableEntry = {
      type: 'card',
      label: 'Card',
      mode: 'additive',
      source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
    };

    setLoadableEntries([entry], assets);

    const resolved = getLoadableEntries();
    expect(resolved).toHaveLength(1);
    const source = resolved[0].source;
    expect(source.kind).toBe('static');
    if (source.kind !== 'static') throw new Error('unreachable');

    expect(source.items).toHaveLength(3);
    expect(source.items.map((i) => i.id).sort()).toEqual([
      '01001',
      '01002',
      '02001',
    ]);
    // Each item carries id + label + data referencing the card code
    expect(source.items[0].label).toBe(source.items[0].id);
    expect(source.items[0].data).toEqual({ code: source.items[0].id });
  });

  it('derives all-card-sets items from the merged asset packs', () => {
    const assets = createGameAssets({
      cardSets: {
        spider_man_nemesis: ['n01', 'n02'],
        captain_america_nemesis: [{ code: 'c01', count: 2 }],
      },
    });

    const entry: LoadableEntry = {
      type: 'encounter-set',
      label: 'Encounter Set',
      mode: 'additive',
      source: { kind: 'asset-pack-derived', derivation: 'all-card-sets' },
    };

    setLoadableEntries([entry], assets);

    const resolved = getLoadableEntries();
    const source = resolved[0].source;
    expect(source.kind).toBe('static');
    if (source.kind !== 'static') throw new Error('unreachable');

    expect(source.items.map((i) => i.id).sort()).toEqual([
      'captain_america_nemesis',
      'spider_man_nemesis',
    ]);
    const spiderItem = source.items.find((i) => i.id === 'spider_man_nemesis');
    expect(spiderItem?.label).toBe('spider_man_nemesis');
    expect(spiderItem?.data).toEqual({ setName: 'spider_man_nemesis' });
  });

  it('produces zero derived items when the asset packs are empty', () => {
    const entry: LoadableEntry = {
      type: 'card',
      label: 'Card',
      mode: 'additive',
      source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
    };

    setLoadableEntries([entry], createGameAssets());

    const source = getLoadableEntries()[0].source;
    expect(source.kind).toBe('static');
    if (source.kind !== 'static') throw new Error('unreachable');
    expect(source.items).toEqual([]);
  });

  it('handles a mixed list of source kinds in one call', () => {
    const assets = createGameAssets({
      cards: { A1: makeCard('a.png') },
      cardSets: { core: ['A1'] },
    });

    const entries: LoadableEntry[] = [
      {
        type: 'scenario',
        label: 'Scenario',
        mode: 'replace',
        source: {
          kind: 'static',
          items: [{ id: 's1', label: 'Scen 1', data: { file: 's1.json' } }],
        },
      },
      {
        type: 'deck',
        label: 'Deck',
        mode: 'additive',
        source: { kind: 'provider', module: 'deckImport.js' },
      },
      {
        type: 'card',
        label: 'Card',
        mode: 'additive',
        source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
      },
      {
        type: 'set',
        label: 'Set',
        mode: 'additive',
        source: { kind: 'asset-pack-derived', derivation: 'all-card-sets' },
      },
    ];

    setLoadableEntries(entries, assets);

    const resolved = getLoadableEntries();
    expect(resolved).toHaveLength(4);
    expect(resolved[0].source.kind).toBe('static');
    expect(resolved[1].source.kind).toBe('provider');
    expect(resolved[2].source.kind).toBe('static'); // derived → materialized
    expect(resolved[3].source.kind).toBe('static'); // derived → materialized
  });

  it('replaces previous entries when called again (latest call wins)', () => {
    const first: LoadableEntry = {
      type: 'scenario',
      label: 'Scenario A',
      mode: 'replace',
      source: { kind: 'static', items: [] },
    };
    const second: LoadableEntry = {
      type: 'deck',
      label: 'Deck B',
      mode: 'additive',
      source: { kind: 'static', items: [] },
    };

    setLoadableEntries([first], createGameAssets());
    expect(getLoadableEntries()).toHaveLength(1);
    expect(getLoadableEntries()[0].type).toBe('scenario');

    setLoadableEntries([second], createGameAssets());
    expect(getLoadableEntries()).toHaveLength(1);
    expect(getLoadableEntries()[0].type).toBe('deck');
  });

  it('clearLoadableEntries resets state', () => {
    const entry: LoadableEntry = {
      type: 'scenario',
      label: 'Scenario',
      mode: 'replace',
      source: {
        kind: 'static',
        items: [{ id: 's1', label: 'S', data: {} }],
      },
    };

    setLoadableEntries([entry], createGameAssets());
    expect(getLoadableEntries()).toHaveLength(1);

    clearLoadableEntries();
    expect(getLoadableEntries()).toEqual([]);
  });
});
