import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  CounterTypeDef,
  GameAssets,
  LoadableEntry,
} from '@cardtable2/shared';
import { COUNTER_LOADABLE_TYPE } from '@cardtable2/shared';
import { setLoadableEntries, clearLoadableEntries } from './loadablesRegistry';
import {
  parseCounterTypeDef,
  getCounterTypeDef,
  getAllCounterTypeDefs,
} from './counterRegistry';

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

function counterEntry(
  items: Array<{ id: string; label: string; data: unknown }>,
): LoadableEntry<unknown> {
  return {
    type: COUNTER_LOADABLE_TYPE,
    label: 'Counter',
    mode: 'additive',
    source: { kind: 'static', items },
  };
}

const validDef: CounterTypeDef = {
  color: 0xf39c12,
  text: 'DMG',
  min: 0,
  max: 99,
  startingValue: 0,
};

describe('parseCounterTypeDef', () => {
  it('accepts a fully populated definition', () => {
    const parsed = parseCounterTypeDef(
      {
        color: 0xff0000,
        text: 'DMG',
        img: 'damage.png',
        min: 0,
        max: 50,
        startingValue: 3,
      },
      'test',
    );
    expect(parsed).toEqual({
      color: 0xff0000,
      text: 'DMG',
      img: 'damage.png',
      min: 0,
      max: 50,
      startingValue: 3,
    });
  });

  it('accepts a minimal definition (no text, no img)', () => {
    const parsed = parseCounterTypeDef(
      { color: 0x123456, min: 0, max: 10, startingValue: 0 },
      'test',
    );
    expect(parsed).toEqual({
      color: 0x123456,
      min: 0,
      max: 10,
      startingValue: 0,
    });
    expect(parsed.text).toBeUndefined();
    expect(parsed.img).toBeUndefined();
  });

  it('rejects non-object input', () => {
    expect(() => parseCounterTypeDef(null, 'ctx')).toThrow(/must be an object/);
    expect(() => parseCounterTypeDef('string', 'ctx')).toThrow(
      /must be an object/,
    );
    expect(() => parseCounterTypeDef(42, 'ctx')).toThrow(/must be an object/);
  });

  it('rejects missing color', () => {
    expect(() =>
      parseCounterTypeDef({ min: 0, max: 10, startingValue: 0 }, 'ctx'),
    ).toThrow(/'color' must be a finite number/);
  });

  it('rejects non-number color', () => {
    expect(() =>
      parseCounterTypeDef(
        { color: 'red', min: 0, max: 10, startingValue: 0 },
        'ctx',
      ),
    ).toThrow(/'color' must be a finite number/);
  });

  it('rejects non-finite numeric fields', () => {
    expect(() =>
      parseCounterTypeDef(
        { color: Infinity, min: 0, max: 10, startingValue: 0 },
        'ctx',
      ),
    ).toThrow(/'color' must be a finite number/);
    expect(() =>
      parseCounterTypeDef(
        { color: 0, min: 0, max: NaN, startingValue: 0 },
        'ctx',
      ),
    ).toThrow(/'max' must be a finite number/);
  });

  it('rejects min > max', () => {
    expect(() =>
      parseCounterTypeDef(
        { color: 0, min: 10, max: 5, startingValue: 0 },
        'ctx',
      ),
    ).toThrow(/'min' \(10\) must be <= 'max' \(5\)/);
  });

  it('accepts min === max (zero-range counter)', () => {
    expect(() =>
      parseCounterTypeDef(
        { color: 0, min: 5, max: 5, startingValue: 5 },
        'ctx',
      ),
    ).not.toThrow();
  });

  it('does NOT clamp startingValue to [min, max]', () => {
    // Per design note in parseCounterTypeDef: startingValue may legitimately
    // sit outside [min, max] (template re-use across modes). Validation only
    // checks that it's a finite number.
    const parsed = parseCounterTypeDef(
      { color: 0, min: 0, max: 10, startingValue: 99 },
      'ctx',
    );
    expect(parsed.startingValue).toBe(99);
  });

  it('rejects non-string text when present', () => {
    expect(() =>
      parseCounterTypeDef(
        { color: 0, min: 0, max: 10, startingValue: 0, text: 42 },
        'ctx',
      ),
    ).toThrow(/'text' must be a string/);
  });

  it('rejects non-string img when present', () => {
    expect(() =>
      parseCounterTypeDef(
        { color: 0, min: 0, max: 10, startingValue: 0, img: false },
        'ctx',
      ),
    ).toThrow(/'img' must be a string/);
  });

  it('includes the supplied context in error messages', () => {
    expect(() => parseCounterTypeDef(null, 'plugin foo entry bar')).toThrow(
      /^plugin foo entry bar:/,
    );
  });
});

describe('getCounterTypeDef / getAllCounterTypeDefs', () => {
  beforeEach(() => {
    clearLoadableEntries();
  });

  it('returns undefined when no plugin is loaded', () => {
    expect(getCounterTypeDef('damage')).toBeUndefined();
    expect(getAllCounterTypeDefs()).toEqual([]);
  });

  it('resolves a single counter type from a plugin manifest', () => {
    const entry = counterEntry([
      { id: 'damage', label: 'Damage', data: validDef },
    ]);
    setLoadableEntries([entry], createGameAssets());

    const resolved = getCounterTypeDef('damage');
    expect(resolved).toEqual({
      id: 'damage',
      label: 'Damage',
      def: validDef,
    });
  });

  it('returns undefined for an unknown id even when others are registered', () => {
    const entry = counterEntry([
      { id: 'damage', label: 'Damage', data: validDef },
    ]);
    setLoadableEntries([entry], createGameAssets());

    expect(getCounterTypeDef('unknown')).toBeUndefined();
  });

  it('lists every declared counter type', () => {
    const entry = counterEntry([
      { id: 'damage', label: 'Damage', data: validDef },
      {
        id: 'threat',
        label: 'Threat',
        data: { color: 0x3498db, min: 0, max: 20, startingValue: 0 },
      },
    ]);
    setLoadableEntries([entry], createGameAssets());

    const list = getAllCounterTypeDefs();
    expect(list).toHaveLength(2);
    const byId = Object.fromEntries(list.map((r) => [r.id, r]));
    expect(byId['damage']?.label).toBe('Damage');
    expect(byId['damage']?.def).toEqual(validDef);
    expect(byId['threat']?.label).toBe('Threat');
    expect(byId['threat']?.def.color).toBe(0x3498db);
  });

  it('passes through optional text and img', () => {
    const entry = counterEntry([
      {
        id: 'shield',
        label: 'Shield',
        data: {
          color: 0,
          text: 'SHD',
          img: 'shield.png',
          min: 0,
          max: 10,
          startingValue: 0,
        },
      },
    ]);
    setLoadableEntries([entry], createGameAssets());

    const resolved = getCounterTypeDef('shield');
    expect(resolved?.def.text).toBe('SHD');
    expect(resolved?.def.img).toBe('shield.png');
  });

  describe('multiple-loadable-entry merging', () => {
    it('flattens counter types across multiple `type: counter` entries', () => {
      // Plugins may declare more than one `counter` loadable (e.g. grouped
      // by theme); the resolver flattens them. Matches the `scenario`
      // precedent in getLoadablesOfType tests.
      const entryA = counterEntry([
        { id: 'damage', label: 'Damage', data: validDef },
      ]);
      const entryB = counterEntry([
        {
          id: 'threat',
          label: 'Threat',
          data: { color: 0x3498db, min: 0, max: 20, startingValue: 0 },
        },
      ]);
      setLoadableEntries([entryA, entryB], createGameAssets());

      const ids = getAllCounterTypeDefs()
        .map((r) => r.id)
        .sort();
      expect(ids).toEqual(['damage', 'threat']);
    });
  });

  describe('malformed declarations', () => {
    it('drops malformed entries from getAllCounterTypeDefs with a warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const entry = counterEntry([
        { id: 'valid', label: 'Valid', data: validDef },
        { id: 'bad', label: 'Bad', data: { color: 'red' } },
      ]);
      setLoadableEntries([entry], createGameAssets());

      const list = getAllCounterTypeDefs();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('valid');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("dropping malformed counter type 'bad'"),
      );

      warnSpy.mockRestore();
    });

    it('keeps the first declaration when ids collide within the same plugin load', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const entry = counterEntry([
        { id: 'damage', label: 'Damage A', data: validDef },
        {
          id: 'damage',
          label: 'Damage B',
          data: { ...validDef, color: 0x000000 },
        },
      ]);
      setLoadableEntries([entry], createGameAssets());

      const list = getAllCounterTypeDefs();
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe('Damage A');
      expect(list[0].def.color).toBe(validDef.color);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("duplicate counter type id 'damage'"),
      );

      warnSpy.mockRestore();
    });

    it('getCounterTypeDef THROWS for a malformed entry with the matching id', () => {
      // Distinct from getAllCounterTypeDefs (which drops + warns): a direct
      // point lookup with a known id but malformed data is a hard error at
      // spawn time — callers should not silently fall back.
      const entry = counterEntry([
        { id: 'bad', label: 'Bad', data: { color: 'red' } },
      ]);
      setLoadableEntries([entry], createGameAssets());

      expect(() => getCounterTypeDef('bad')).toThrow(
        /'color' must be a finite number/,
      );
    });
  });

  describe('explicit entries argument (no global registry mutation)', () => {
    it('reads from the supplied entries array, ignoring registry state', () => {
      // Manifest-level callers (e.g. pluginLoader pre-population) may pass
      // entries directly without first installing them in the global
      // registry. Verify the resolver supports that path.
      const entries: LoadableEntry[] = [
        counterEntry([{ id: 'explicit', label: 'Explicit', data: validDef }]),
      ];

      // Global registry is empty
      expect(getCounterTypeDef('explicit')).toBeUndefined();

      // Direct entries lookup finds it.
      expect(getCounterTypeDef('explicit', entries)?.id).toBe('explicit');
      expect(getAllCounterTypeDefs(entries)).toHaveLength(1);
    });
  });
});
