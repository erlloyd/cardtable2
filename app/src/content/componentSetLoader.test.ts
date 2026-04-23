import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadStaticComponentSet } from './componentSetLoader';
import type {
  GameAssets,
  AssetPack,
  StaticComponentSetEntry,
} from '@cardtable2/shared';
import { ObjectKind, type StackObject } from '@cardtable2/shared';

const mockPack: AssetPack = {
  schema: 'ct-assets@1',
  id: 'pack1',
  name: 'Pack 1',
  version: '1.0.0',
  cardTypes: {
    hero: { back: 'hero_back.jpg', size: 'standard' },
  },
  cards: {
    '01001': { type: 'hero', face: '01001.jpg' },
    '01002': { type: 'hero', face: '01002.jpg' },
  },
  cardSets: {
    heroes: ['01001', '01002'],
  },
  tokens: {
    damage: { image: 'damage.png', size: 'medium' },
  },
  counters: {
    threat: { label: 'Threat', min: 0, max: 99, start: 5 },
  },
  mats: {},
};

const mockAssets: GameAssets = {
  packs: [mockPack],
  cardTypes: mockPack.cardTypes!,
  cards: mockPack.cards!,
  cardSets: mockPack.cardSets!,
  tokens: mockPack.tokens!,
  counters: mockPack.counters!,
  mats: mockPack.mats ?? {},
  tokenTypes: {},
  statusTypes: {},
  modifierStats: {},
  iconTypes: {},
};

describe('loadStaticComponentSet', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should load a static component set with deck references', () => {
    const entry: StaticComponentSetEntry = {
      id: 'hero-deck',
      name: 'Hero Deck',
      stacks: [
        {
          label: 'Hero Deck',
          faceUp: false,
          deck: { cardSets: ['heroes'] },
        },
      ],
    };

    const result = loadStaticComponentSet({ entry, gameAssets: mockAssets });

    expect('objectCount' in result).toBe(true);
    if ('objectCount' in result) {
      expect(result.objectCount).toBe(1);
      const stack = [...result.objects.values()][0] as StackObject;
      expect(stack._kind).toBe(ObjectKind.Stack);
      expect(stack._cards).toEqual(['01001', '01002']);
    }
  });

  it('should load a static component set with mixed types', () => {
    const entry: StaticComponentSetEntry = {
      id: 'encounter',
      name: 'Encounter Set',
      stacks: [
        {
          label: 'Encounter Deck',
          faceUp: false,
          deck: { cardSets: ['heroes'], shuffle: true },
        },
      ],
      tokens: [{ ref: 'damage', label: 'Damage' }],
      counters: [{ ref: 'threat' }],
    };

    const result = loadStaticComponentSet({ entry, gameAssets: mockAssets });

    expect('objectCount' in result).toBe(true);
    if ('objectCount' in result) {
      expect(result.objectCount).toBe(3);
    }
  });

  it('should return error for invalid deck reference', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const entry: StaticComponentSetEntry = {
      id: 'bad-deck',
      name: 'Bad Deck',
      stacks: [
        {
          label: 'Bad',
          faceUp: false,
          deck: { cardSets: ['nonexistent'] },
        },
      ],
    };

    const result = loadStaticComponentSet({ entry, gameAssets: mockAssets });

    // Should still succeed — bad stacks are warned and skipped
    expect('objectCount' in result).toBe(true);
    if ('objectCount' in result) {
      expect(result.objectCount).toBe(0);
    }
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should handle empty component set', () => {
    const entry: StaticComponentSetEntry = {
      id: 'empty',
      name: 'Empty Set',
    };

    const result = loadStaticComponentSet({ entry, gameAssets: mockAssets });

    expect('objectCount' in result).toBe(true);
    if ('objectCount' in result) {
      expect(result.objectCount).toBe(0);
    }
  });
});
