import { describe, it, expect, beforeEach } from 'vitest';
import type { Card, GameAssets, LoadableEntry } from '@cardtable2/shared';
import {
  setLoadableEntries,
  getLoadableEntries,
  clearLoadableEntries,
  getLoadablesPluginBaseUrl,
  resolveParserModuleUrl,
  getLoadablesOfType,
  getStaticItems,
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

function makeCard(face: string, name = '', type = 'player'): Card {
  return { name, face, type };
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
          { typeId: 's1', label: 'Scenario One', data: { file: 'one.json' } },
          { typeId: 's2', label: 'Scenario Two', data: { file: 'two.json' } },
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
        config: {
          labels: { siteName: 'MarvelCDB', inputPlaceholder: 'Deck ID' },
        },
      },
    };

    setLoadableEntries([entry], createGameAssets());

    const resolved = getLoadableEntries();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].source).toEqual({
      kind: 'provider',
      module: 'deckImport.js',
      config: {
        labels: { siteName: 'MarvelCDB', inputPlaceholder: 'Deck ID' },
      },
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
    expect(source.items.map((i) => i.typeId).sort()).toEqual([
      '01001',
      '01002',
      '02001',
    ]);
    // Each item carries typeId + label + data referencing the card code
    expect(source.items[0].label).toBe(source.items[0].typeId);
    expect(source.items[0].data).toEqual({ code: source.items[0].typeId });
  });

  it('uses the card name as the derived item label when name is non-empty', () => {
    const assets = createGameAssets({
      cards: {
        '01001': makeCard('hero.png', 'Hero'),
      },
    });

    const entry: LoadableEntry = {
      type: 'card',
      label: 'Card',
      mode: 'additive',
      source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
    };

    setLoadableEntries([entry], assets);

    const source = getLoadableEntries()[0].source;
    expect(source.kind).toBe('static');
    if (source.kind !== 'static') throw new Error('unreachable');

    expect(source.items).toHaveLength(1);
    expect(source.items[0].typeId).toBe('01001');
    expect(source.items[0].label).toBe('Hero');
  });

  describe('all-cards: two-sided card merging via back_code', () => {
    const cardEntry: LoadableEntry = {
      type: 'card',
      label: 'Card',
      mode: 'additive',
      source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
    };

    it('merges a bidirectional pair into one entry with combined label', () => {
      // MC-style hero/alter-ego: 01001A ↔ 01001B point at each other.
      const assets = createGameAssets({
        cards: {
          '01001A': {
            ...makeCard('hero.png', 'Spider-Man'),
            back_code: '01001B',
          },
          '01001B': {
            ...makeCard('alter.png', 'Peter Parker'),
            back_code: '01001A',
          },
        },
      });

      setLoadableEntries([cardEntry], assets);

      const source = getLoadableEntries()[0].source;
      expect(source.kind).toBe('static');
      if (source.kind !== 'static') throw new Error('unreachable');

      expect(source.items).toHaveLength(1);
      // Lower code wins (alphabetical) so hero/front side loads by default.
      expect(source.items[0].typeId).toBe('01001A');
      expect(source.items[0].label).toBe('Spider-Man / Peter Parker');
      expect(source.items[0].data).toEqual({ code: '01001A' });
    });

    it('emits combined label using codes when both names are empty', () => {
      const assets = createGameAssets({
        cards: {
          '01001A': { ...makeCard('hero.png'), back_code: '01001B' },
          '01001B': { ...makeCard('alter.png'), back_code: '01001A' },
        },
      });

      setLoadableEntries([cardEntry], assets);

      const source = getLoadableEntries()[0].source;
      if (source.kind !== 'static') throw new Error('unreachable');

      expect(source.items).toHaveLength(1);
      expect(source.items[0].typeId).toBe('01001A');
      expect(source.items[0].label).toBe('01001A / 01001B');
    });

    it('emits only the front side for asymmetric back_code (B points at nothing)', () => {
      // Encounter card A points at image-only back B; B has no back_code.
      const assets = createGameAssets({
        cards: {
          '02001A': {
            ...makeCard('front.png', 'Encounter Front'),
            back_code: '02001B',
          },
          '02001B': makeCard('back-image.png', 'Encounter Back'),
        },
      });

      setLoadableEntries([cardEntry], assets);

      const source = getLoadableEntries()[0].source;
      if (source.kind !== 'static') throw new Error('unreachable');

      expect(source.items).toHaveLength(1);
      expect(source.items[0].typeId).toBe('02001A');
      expect(source.items[0].label).toBe('Encounter Front');
      expect(source.items[0].data).toEqual({ code: '02001A' });
    });

    it('emits only A when back_code points at a non-matching partner', () => {
      // Asymmetric: A→B but B→C (not back to A).
      const assets = createGameAssets({
        cards: {
          A: { ...makeCard('a.png', 'A name'), back_code: 'B' },
          B: { ...makeCard('b.png', 'B name'), back_code: 'C' },
          C: makeCard('c.png', 'C name'),
        },
      });

      setLoadableEntries([cardEntry], assets);

      const source = getLoadableEntries()[0].source;
      if (source.kind !== 'static') throw new Error('unreachable');

      // A emitted (asymmetric: A→B, B doesn't point back). B suppressed
      // (treated as image-only metadata for A). C reached as a singleton
      // (B never executes its asymmetric branch because A suppressed it).
      const ids = source.items.map((i) => i.typeId).sort();
      expect(ids).toEqual(['A', 'C']);
      const aItem = source.items.find((i) => i.typeId === 'A');
      expect(aItem?.label).toBe('A name');
    });

    it('emits A as a singleton when back_code points at a non-existent code (dangling)', () => {
      const assets = createGameAssets({
        cards: {
          A: { ...makeCard('a.png', 'A name'), back_code: 'GHOST' },
        },
      });

      setLoadableEntries([cardEntry], assets);

      const source = getLoadableEntries()[0].source;
      if (source.kind !== 'static') throw new Error('unreachable');

      expect(source.items).toHaveLength(1);
      expect(source.items[0].typeId).toBe('A');
      expect(source.items[0].label).toBe('A name');
      expect(source.items[0].data).toEqual({ code: 'A' });
    });

    it('handles a mix of paired, asymmetric, and singleton cards', () => {
      const assets = createGameAssets({
        cards: {
          // Bidirectional pair → one entry "Hero / Alter".
          '01001A': { ...makeCard('hero.png', 'Hero'), back_code: '01001B' },
          '01001B': { ...makeCard('alter.png', 'Alter'), back_code: '01001A' },
          // Asymmetric: front → image-only back.
          '02001A': { ...makeCard('front.png', 'Front'), back_code: '02001B' },
          '02001B': makeCard('back.png', 'Back'),
          // Plain singleton.
          '03001': makeCard('solo.png', 'Solo'),
          // Dangling pointer.
          '04001': { ...makeCard('lone.png', 'Lone'), back_code: 'NOPE' },
        },
      });

      setLoadableEntries([cardEntry], assets);

      const source = getLoadableEntries()[0].source;
      if (source.kind !== 'static') throw new Error('unreachable');

      expect(source.items).toHaveLength(4);
      const byId = Object.fromEntries(source.items.map((i) => [i.typeId, i]));
      expect(byId['01001A']?.label).toBe('Hero / Alter');
      expect(byId['02001A']?.label).toBe('Front');
      expect(byId['03001']?.label).toBe('Solo');
      expect(byId['04001']?.label).toBe('Lone');
      // 01001B and 02001B must NOT appear as separate entries.
      expect(byId['01001B']).toBeUndefined();
      expect(byId['02001B']).toBeUndefined();
    });

    it('merges pair regardless of iteration order (B before A)', () => {
      // Object.entries preserves insertion order; verify the merge works
      // when the higher code appears first.
      const assets = createGameAssets({
        cards: {
          '01001B': {
            ...makeCard('alter.png', 'Peter Parker'),
            back_code: '01001A',
          },
          '01001A': {
            ...makeCard('hero.png', 'Spider-Man'),
            back_code: '01001B',
          },
        },
      });

      setLoadableEntries([cardEntry], assets);

      const source = getLoadableEntries()[0].source;
      if (source.kind !== 'static') throw new Error('unreachable');

      expect(source.items).toHaveLength(1);
      expect(source.items[0].typeId).toBe('01001A');
      expect(source.items[0].label).toBe('Spider-Man / Peter Parker');
    });
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

    expect(source.items.map((i) => i.typeId).sort()).toEqual([
      'captain_america_nemesis',
      'spider_man_nemesis',
    ]);
    const spiderItem = source.items.find(
      (i) => i.typeId === 'spider_man_nemesis',
    );
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
          items: [{ typeId: 's1', label: 'Scen 1', data: { file: 's1.json' } }],
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
        items: [{ typeId: 's1', label: 'S', data: {} }],
      },
    };

    setLoadableEntries([entry], createGameAssets());
    expect(getLoadableEntries()).toHaveLength(1);

    clearLoadableEntries();
    expect(getLoadableEntries()).toEqual([]);
  });

  describe('parser module URL resolution (ct-qbn)', () => {
    it('records and returns the plugin base URL', () => {
      setLoadableEntries([], createGameAssets(), 'https://example.com/plugin/');
      expect(getLoadablesPluginBaseUrl()).toBe('https://example.com/plugin/');
    });

    it('returns empty plugin base URL when none supplied', () => {
      setLoadableEntries([], createGameAssets());
      expect(getLoadablesPluginBaseUrl()).toBe('');
    });

    it('resolves a parser-module path against the plugin base URL', () => {
      setLoadableEntries([], createGameAssets(), 'https://example.com/plugin/');
      expect(resolveParserModuleUrl('deckImport.js')).toBe(
        'https://example.com/plugin/deckImport.js',
      );
    });

    it('prefers a blob URL when the filename is in the local-plugin map', () => {
      const blobUrls = new Map<string, string>([
        ['deckImport.js', 'blob:mock-deck-import'],
      ]);
      setLoadableEntries(
        [],
        createGameAssets(),
        'https://example.com/plugin/',
        blobUrls,
      );
      // Local-plugin blob takes precedence even when a baseUrl is set.
      expect(resolveParserModuleUrl('deckImport.js')).toBe(
        'blob:mock-deck-import',
      );
    });

    it('returns the bare filename when no baseUrl or blob is registered', () => {
      setLoadableEntries([], createGameAssets());
      expect(resolveParserModuleUrl('deckImport.js')).toBe('deckImport.js');
    });

    it('clearLoadableEntries resets the baseUrl + blob map', () => {
      setLoadableEntries(
        [],
        createGameAssets(),
        'https://example.com/plugin/',
        new Map([['x.js', 'blob:x']]),
      );
      clearLoadableEntries();
      expect(getLoadablesPluginBaseUrl()).toBe('');
      expect(resolveParserModuleUrl('x.js')).toBe('x.js');
    });
  });

  describe('selectors', () => {
    const scenarioEntry: LoadableEntry<{ file: string }> = {
      type: 'scenario',
      label: 'Scenario',
      mode: 'replace',
      source: {
        kind: 'static',
        items: [
          { typeId: 's1', label: 'Scenario One', data: { file: 'one.json' } },
          { typeId: 's2', label: 'Scenario Two', data: { file: 'two.json' } },
        ],
      },
    };

    const deckEntry: LoadableEntry = {
      type: 'deck',
      label: 'Deck',
      mode: 'additive',
      source: {
        kind: 'provider',
        module: 'deckImport.js',
      },
    };

    const cardEntry: LoadableEntry = {
      type: 'card',
      label: 'Card',
      mode: 'additive',
      source: { kind: 'asset-pack-derived', derivation: 'all-cards' },
    };

    describe('getLoadablesOfType', () => {
      it('returns entries whose type matches', () => {
        const matched = getLoadablesOfType(
          [scenarioEntry, deckEntry, cardEntry],
          'scenario',
        );
        expect(matched).toHaveLength(1);
        expect(matched[0]).toBe(scenarioEntry);
      });

      it('returns an empty array when no entry matches', () => {
        const matched = getLoadablesOfType(
          [scenarioEntry, deckEntry],
          'encounter-set',
        );
        expect(matched).toEqual([]);
      });

      it('returns multiple entries when several share a type', () => {
        // Plugins are free to declare two categories with the same `type`
        // (e.g. two grouped scenario lists). The selector returns all of them
        // so callers can decide whether to flatten or merge.
        const second: LoadableEntry<{ file: string }> = {
          ...scenarioEntry,
          label: 'Scenario (Pack 2)',
          source: {
            kind: 'static',
            items: [
              {
                typeId: 's3',
                label: 'Scenario 3',
                data: { file: 'three.json' },
              },
            ],
          },
        };
        const matched = getLoadablesOfType(
          [scenarioEntry, second, deckEntry],
          'scenario',
        );
        expect(matched).toHaveLength(2);
        expect(matched).toEqual([scenarioEntry, second]);
      });

      it('includes provider-source entries (no items, type still matches)', () => {
        // Provider-source entries materialize items at action time, not at
        // registry population. They should still surface in a type filter so
        // call sites can detect "is there a deck loadable?" without inspecting
        // each entry's source kind.
        const matched = getLoadablesOfType([deckEntry, cardEntry], 'deck');
        expect(matched).toEqual([deckEntry]);
      });
    });

    describe('getStaticItems', () => {
      it('flattens static items for the given type', () => {
        const items = getStaticItems<{ file: string }>(
          [scenarioEntry, deckEntry],
          'scenario',
        );
        expect(items).toHaveLength(2);
        expect(items.map((i) => i.data.file)).toEqual(['one.json', 'two.json']);
      });

      it('returns an empty array when the type is absent', () => {
        const items = getStaticItems(
          [scenarioEntry, deckEntry],
          'encounter-set',
        );
        expect(items).toEqual([]);
      });

      it('includes asset-pack-derived items after registry materialization', () => {
        // setLoadableEntries converts asset-pack-derived sources to static
        // items; once materialized, getStaticItems returns them uniformly.
        const assets = createGameAssets({
          cards: {
            '01001': makeCard('one.png', 'Hero'),
          },
        });
        setLoadableEntries([cardEntry], assets);
        const resolved = getLoadableEntries();
        const items = getStaticItems<{ code: string }>(resolved, 'card');
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({
          typeId: '01001',
          label: 'Hero',
          data: { code: '01001' },
        });
      });

      it('skips provider-source entries (they have no items yet)', () => {
        // Provider sources materialize at action time, not registry population.
        // getStaticItems intentionally omits them rather than returning
        // placeholder items.
        const items = getStaticItems([deckEntry], 'deck');
        expect(items).toEqual([]);
      });
    });
  });
});
