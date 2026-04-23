import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Scenario,
  GameAssets,
  DeckDefinition,
  AssetPack,
} from '@cardtable2/shared';
import { ObjectKind, type StackObject } from '@cardtable2/shared';
import {
  expandDeck,
  namespaceCardCode,
  namespaceDeckCards,
  generateSortKey,
  instantiateScenario,
} from './instantiate';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockPack1: AssetPack = {
  schema: 'ct-assets@1',
  id: 'pack1',
  name: 'Pack 1',
  version: '1.0.0',
  cardTypes: {
    hero: {
      back: 'hero_back.jpg',
      size: 'standard',
    },
  },
  cards: {
    '01001': {
      type: 'hero',
      face: '01001.jpg',
    },
    '01002': {
      type: 'hero',
      face: '01002.jpg',
    },
    '01003': {
      type: 'hero',
      face: '01003.jpg',
    },
  },
  cardSets: {
    heroes: ['01001', '01002', '01003'],
  },
  tokens: {
    damage: {
      image: 'damage.png',
      size: 'medium',
    },
  },
  counters: {
    threat: {
      label: 'Threat',
      min: 0,
      max: 99,
      start: 5,
    },
  },
  mats: {
    playmat: {
      image: 'playmat.jpg',
      size: [1920, 1080],
    },
  },
};

const mockPack2: AssetPack = {
  schema: 'ct-assets@1',
  id: 'pack2',
  name: 'Pack 2',
  version: '1.0.0',
  cardTypes: {
    villain: {
      back: 'villain_back.jpg',
      size: 'standard',
    },
  },
  cards: {
    '02001': {
      type: 'villain',
      face: '02001.jpg',
    },
  },
};

const mockContent: GameAssets = {
  packs: [mockPack1, mockPack2],
  cardTypes: {
    ...mockPack1.cardTypes,
    ...mockPack2.cardTypes,
  },
  cards: {
    ...mockPack1.cards,
    ...mockPack2.cards,
  },
  cardSets: mockPack1.cardSets ?? {},
  tokens: mockPack1.tokens ?? {},
  counters: mockPack1.counters ?? {},
  mats: mockPack1.mats ?? {},
  tokenTypes: {},
  statusTypes: {},
  modifierStats: {},
  iconTypes: {},
};

// ============================================================================
// expandDeck Tests
// ============================================================================

describe('expandDeck', () => {
  it('should expand deck with cardSets', () => {
    const deckDef: DeckDefinition = {
      cardSets: ['heroes'],
    };

    const cards = expandDeck(deckDef, mockContent);

    expect(cards).toEqual(['01001', '01002', '01003']);
  });

  it('should expand deck with individual cards', () => {
    const deckDef: DeckDefinition = {
      cards: [
        { code: '01001', count: 2 },
        { code: '01002', count: 1 },
      ],
    };

    const cards = expandDeck(deckDef, mockContent);

    expect(cards).toEqual(['01001', '01001', '01002']);
  });

  it('should combine cardSets and individual cards', () => {
    const deckDef: DeckDefinition = {
      cardSets: ['heroes'],
      cards: [{ code: '02001', count: 1 }],
    };

    const cards = expandDeck(deckDef, mockContent);

    expect(cards).toEqual(['01001', '01002', '01003', '02001']);
  });

  it('should shuffle deck when shuffle is true', () => {
    const deckDef: DeckDefinition = {
      cardSets: ['heroes'],
      shuffle: true,
    };

    const mockRandom = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.3);

    const cards = expandDeck(deckDef, mockContent);

    expect(cards).toHaveLength(3);
    expect(cards).toContain('01001');
    expect(cards).toContain('01002');
    expect(cards).toContain('01003');

    mockRandom.mockRestore();
  });

  it('should not shuffle deck when shuffle is false or omitted', () => {
    const deckDef: DeckDefinition = {
      cardSets: ['heroes'],
      shuffle: false,
    };

    const cards = expandDeck(deckDef, mockContent);

    expect(cards).toEqual(['01001', '01002', '01003']);
  });

  it('should throw error for missing cardSet', () => {
    const deckDef: DeckDefinition = {
      cardSets: ['nonexistent'],
    };

    expect(() => expandDeck(deckDef, mockContent)).toThrow(
      'Card set not found: nonexistent',
    );
  });

  it('should handle empty deck definition', () => {
    const deckDef: DeckDefinition = {};

    const cards = expandDeck(deckDef, mockContent);

    expect(cards).toEqual([]);
  });

  it('should handle multiple cardSets', () => {
    const contentWithMultipleSets: GameAssets = {
      ...mockContent,
      cardSets: {
        setA: ['01001', '01002'],
        setB: ['01003'],
      },
    };

    const deckDef: DeckDefinition = {
      cardSets: ['setA', 'setB'],
    };

    const cards = expandDeck(deckDef, contentWithMultipleSets);

    expect(cards).toEqual(['01001', '01002', '01003']);
  });
});

// ============================================================================
// namespaceCardCode Tests
// ============================================================================

describe('namespaceCardCode', () => {
  it('should return plain card code (namespacing disabled)', () => {
    expect(namespaceCardCode('pack1', '01001')).toBe('01001');
  });

  it('should return plain card code regardless of pack ID', () => {
    expect(namespaceCardCode('core', 'ABC123')).toBe('ABC123');
  });
});

// ============================================================================
// namespaceDeckCards Tests
// ============================================================================

describe('namespaceDeckCards', () => {
  it('should return plain card codes (namespacing disabled)', () => {
    const cards = ['01001', '01002', '02001'];

    const result = namespaceDeckCards(cards, mockContent);

    expect(result).toEqual(['01001', '01002', '02001']);
  });

  it('should not validate cards (no-op behavior)', () => {
    const cards = ['99999'];

    const result = namespaceDeckCards(cards, mockContent);
    expect(result).toEqual(['99999']);
  });

  it('should handle empty card list', () => {
    const cards: string[] = [];

    const result = namespaceDeckCards(cards, mockContent);

    expect(result).toEqual([]);
  });

  it('should handle duplicate cards', () => {
    const cards = ['01001', '01001', '01002'];

    const result = namespaceDeckCards(cards, mockContent);

    expect(result).toEqual(['01001', '01001', '01002']);
  });
});

// ============================================================================
// generateSortKey Tests
// ============================================================================

describe('generateSortKey', () => {
  it('should generate sort key from index', () => {
    expect(generateSortKey(0)).toBe('001000');
  });

  it('should generate lexicographically increasing keys', () => {
    const key1 = generateSortKey(0);
    const key2 = generateSortKey(1);
    const key3 = generateSortKey(2);

    expect(key1 < key2).toBe(true);
    expect(key2 < key3).toBe(true);
  });

  it('should generate consistent sort keys', () => {
    expect(generateSortKey(5)).toBe(generateSortKey(5));
  });

  it('should handle negative indices', () => {
    const key = generateSortKey(-10);
    expect(key).toBeDefined();
  });
});

// ============================================================================
// instantiateScenario Tests (ct-scenario@2 format)
// ============================================================================

describe('instantiateScenario', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should instantiate empty scenario', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {},
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(0);
  });

  it('should instantiate scenario without componentSet', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(0);
  });

  it('should instantiate stack with deck definition', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        stacks: [
          {
            label: 'Hero Deck',
            faceUp: false,
            deck: {
              cards: [
                { code: '01001', count: 2 },
                { code: '01002', count: 1 },
              ],
            },
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const stack = [...objects.values()][0] as StackObject;

    expect(stack._kind).toBe(ObjectKind.Stack);
    expect(stack._cards).toEqual(['01001', '01001', '01002']);
    expect(stack._faceUp).toBe(false);
  });

  it('should instantiate token', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        tokens: [{ ref: 'damage', label: 'Damage Token' }],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const token = [...objects.values()][0];

    expect(token._kind).toBe(ObjectKind.Token);
    expect(token._meta.tokenRef).toBe('damage');
    expect(token._meta.label).toBe('Damage Token');
  });

  it('should instantiate counter', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        counters: [{ ref: 'threat', label: 'Threat Counter' }],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const counter = [...objects.values()][0];

    expect(counter._kind).toBe(ObjectKind.Counter);
    expect(counter._meta.counterRef).toBe('threat');
    expect(counter._meta.label).toBe('Threat Counter');
    expect(counter._meta.value).toBe(5);
    expect(counter._meta.min).toBe(0);
    expect(counter._meta.max).toBe(99);
  });

  it('should instantiate mat', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        mats: [{ ref: 'playmat' }],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const mat = [...objects.values()][0];

    expect(mat._kind).toBe(ObjectKind.Mat);
    expect(mat._meta.matRef).toBe('playmat');
  });

  it('should instantiate zone with ref', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        zones: [{ ref: 'discard', label: 'Discard Pile' }],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const zone = [...objects.values()][0];

    expect(zone._kind).toBe(ObjectKind.Zone);
    expect(zone._meta.zoneRef).toBe('discard');
    expect(zone._meta.label).toBe('Discard Pile');
  });

  it('should instantiate inline zone with dimensions', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        zones: [{ label: 'Custom Zone', width: 150, height: 200 }],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const zone = [...objects.values()][0];

    expect(zone._kind).toBe(ObjectKind.Zone);
    expect(zone._meta.label).toBe('Custom Zone');
    expect(zone._meta.width).toBe(150);
    expect(zone._meta.height).toBe(200);
  });

  it('should instantiate multiple objects', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        stacks: [
          {
            label: 'Deck',
            faceUp: false,
            cards: ['01001'],
          },
        ],
        tokens: [{ ref: 'damage' }],
        counters: [{ ref: 'threat' }],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(3);

    const kinds = [...objects.values()].map((o) => o._kind);
    expect(kinds).toContain(ObjectKind.Stack);
    expect(kinds).toContain(ObjectKind.Token);
    expect(kinds).toContain(ObjectKind.Counter);
  });

  it('should set common object properties', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      componentSet: {
        tokens: [{ ref: 'damage' }],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);
    const token = [...objects.values()][0];

    expect(token._containerId).toBe(null);
    expect(token._locked).toBe(false);
    expect(token._selectedBy).toBe(null);
    expect(token._meta).toBeDefined();
    expect(token._sortKey).toBeDefined();
    expect(token._pos).toBeDefined();
  });
});
