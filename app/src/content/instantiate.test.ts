import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Scenario,
  GameAssets,
  DeckDefinition,
  AssetPack,
  LayoutObject,
} from '@cardtable2/shared';
import {
  ObjectKind,
  type StackObject,
  type TokenObject,
} from '@cardtable2/shared';
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

    // Mock Math.random to make shuffling deterministic
    const mockRandom = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // First swap
      .mockReturnValueOnce(0.3); // Second swap

    const cards = expandDeck(deckDef, mockContent);

    expect(cards).toHaveLength(3);
    expect(cards).toContain('01001');
    expect(cards).toContain('01002');
    expect(cards).toContain('01003');
    // Order will be different due to shuffle

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
  it('should create namespaced card code', () => {
    expect(namespaceCardCode('pack1', '01001')).toBe('pack1/01001');
  });

  it('should handle different pack IDs', () => {
    expect(namespaceCardCode('core', 'ABC123')).toBe('core/ABC123');
  });
});

// ============================================================================
// namespaceDeckCards Tests
// ============================================================================

describe('namespaceDeckCards', () => {
  it('should namespace all cards in deck', () => {
    const cards = ['01001', '01002', '02001'];

    const namespaced = namespaceDeckCards(cards, mockContent);

    expect(namespaced).toEqual(['pack1/01001', 'pack1/01002', 'pack2/02001']);
  });

  it('should throw error for card not found in any pack', () => {
    const cards = ['99999'];

    expect(() => namespaceDeckCards(cards, mockContent)).toThrow(
      'Card 99999 not found in any loaded pack',
    );
  });

  it('should handle empty card list', () => {
    const cards: string[] = [];

    const namespaced = namespaceDeckCards(cards, mockContent);

    expect(namespaced).toEqual([]);
  });

  it('should handle duplicate cards', () => {
    const cards = ['01001', '01001', '01002'];

    const namespaced = namespaceDeckCards(cards, mockContent);

    expect(namespaced).toEqual(['pack1/01001', 'pack1/01001', 'pack1/01002']);
  });
});

// ============================================================================
// generateSortKey Tests
// ============================================================================

describe('generateSortKey', () => {
  it('should generate sort key from index', () => {
    expect(generateSortKey(0)).toBe('rs'); // (0+1)*1000 = 1000 in base 36
  });

  it('should generate increasing numeric values', () => {
    const key1 = generateSortKey(0);
    const key2 = generateSortKey(1);
    const key3 = generateSortKey(2);

    // Convert back to numbers for comparison
    const val1 = parseInt(key1, 36);
    const val2 = parseInt(key2, 36);
    const val3 = parseInt(key3, 36);

    expect(val1 < val2).toBe(true);
    expect(val2 < val3).toBe(true);
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
// instantiateScenario Tests
// ============================================================================

describe('instantiateScenario', () => {
  beforeEach(() => {
    // Mock Math.random for deterministic shuffling in tests
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should instantiate empty scenario', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(0);
  });

  it('should instantiate scenario without layout', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(0);
  });

  it('should instantiate stack with deck', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      decks: {
        heroDeck: {
          cards: [
            { code: '01001', count: 2 },
            { code: '01002', count: 1 },
          ],
          shuffle: false,
        },
      },
      layout: {
        objects: [
          {
            type: 'stack',
            id: 'deck1',
            pos: { x: 100, y: 200 },
            z: 0,
            deck: 'heroDeck',
            faceUp: false,
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const stack = objects.get('deck1')! as StackObject;

    expect(stack._kind).toBe(ObjectKind.Stack);
    expect(stack._pos).toEqual({ x: 100, y: 200, r: 0 });
    expect(stack._cards).toEqual(['pack1/01001', 'pack1/01001', 'pack1/01002']);
    expect(stack._faceUp).toBe(false);
  });

  it('should instantiate token', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'token',
            ref: 'damage',
            pos: { x: 300, y: 400 },
            z: 5,
            label: 'Damage Token',
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const token = objects.get('test:token:damage')! as TokenObject;

    expect(token._kind).toBe(ObjectKind.Token);
    expect(token._pos).toEqual({ x: 300, y: 400, r: 0 });
    expect(token._meta.tokenRef).toBe('damage');
    expect(token._meta.label).toBe('Damage Token');
    expect(token._faceUp).toBe(true);
  });

  it('should instantiate mat', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'mat',
            ref: 'playmat',
            pos: { x: 0, y: 0 },
            z: -100,
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const mat = objects.get('test:mat:playmat')!;

    expect(mat._kind).toBe(ObjectKind.Mat);
    expect(mat._pos).toEqual({ x: 0, y: 0, r: 0 });
    expect(mat._meta.matRef).toBe('playmat');
  });

  it('should instantiate counter', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'counter',
            ref: 'threat',
            pos: { x: 500, y: 600 },
            z: 10,
            label: 'Threat Counter',
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const counter = objects.get('test:counter:threat')!;

    expect(counter._kind).toBe(ObjectKind.Counter);
    expect(counter._pos).toEqual({ x: 500, y: 600, r: 0 });
    expect(counter._meta.counterRef).toBe('threat');
    expect(counter._meta.label).toBe('Threat Counter'); // Override
    expect(counter._meta.value).toBe(5); // From definition
    expect(counter._meta.min).toBe(0);
    expect(counter._meta.max).toBe(99);
  });

  it('should use counter definition label if not overridden', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'counter',
            ref: 'threat',
            pos: { x: 500, y: 600 },
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    const counter = objects.get('test:counter:threat')!;
    expect(counter._meta.label).toBe('Threat'); // From definition
  });

  it('should instantiate zone', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'zone',
            ref: 'discard',
            pos: { x: 700, y: 800 },
            z: -50,
            label: 'Discard Pile',
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(1);
    const zone = objects.get('test:zone:discard')!;

    expect(zone._kind).toBe(ObjectKind.Zone);
    expect(zone._pos).toEqual({ x: 700, y: 800, r: 0 });
    expect(zone._meta.zoneRef).toBe('discard');
    expect(zone._meta.label).toBe('Discard Pile');
  });

  it('should instantiate multiple objects', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      decks: {
        heroDeck: {
          cards: [{ code: '01001', count: 1 }],
        },
      },
      layout: {
        objects: [
          {
            type: 'stack',
            id: 'deck1',
            pos: { x: 100, y: 200 },
            deck: 'heroDeck',
          },
          {
            type: 'token',
            ref: 'damage',
            pos: { x: 300, y: 400 },
          },
          {
            type: 'counter',
            ref: 'threat',
            pos: { x: 500, y: 600 },
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);

    expect(objects.size).toBe(3);
    expect(objects.has('deck1')).toBe(true);
    expect(objects.has('test:token:damage')).toBe(true);
    expect(objects.has('test:counter:threat')).toBe(true);
  });

  it('should throw error for stack missing id', () => {
    // Testing error handling for invalid object (bypassing type safety)

    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'stack',
            // Missing id
            pos: { x: 100, y: 200 },
          } as LayoutObject,
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Stack object missing required id',
    );
  });

  it('should throw error for token missing ref', () => {
    // Testing error handling for invalid object (bypassing type safety)

    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'token',
            // Missing ref
            pos: { x: 100, y: 200 },
          } as LayoutObject,
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Token object missing required ref',
    );
  });

  it('should throw error for mat missing ref', () => {
    // Testing error handling for invalid object (bypassing type safety)

    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'mat',
            // Missing ref
            pos: { x: 100, y: 200 },
          } as LayoutObject,
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Mat object missing required ref',
    );
  });

  it('should throw error for counter missing ref', () => {
    // Testing error handling for invalid object (bypassing type safety)

    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'counter',
            // Missing ref
            pos: { x: 100, y: 200 },
          } as LayoutObject,
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Counter object missing required ref',
    );
  });

  it('should throw error for zone missing ref', () => {
    // Testing error handling for invalid object (bypassing type safety)

    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'zone',
            // Missing ref
            pos: { x: 100, y: 200 },
          } as LayoutObject,
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Zone object missing required ref',
    );
  });

  it('should throw error for deck not found', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'stack',
            id: 'deck1',
            pos: { x: 100, y: 200 },
            deck: 'nonexistent',
          },
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Deck not found: nonexistent',
    );
  });

  it('should throw error for counter not found', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'counter',
            ref: 'nonexistent',
            pos: { x: 100, y: 200 },
          },
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Counter not found: nonexistent',
    );
  });

  it('should throw error for unknown object type', () => {
    // Testing error handling for invalid object (bypassing type safety)

    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'unknown',
            pos: { x: 100, y: 200 },
          } as unknown as LayoutObject,
        ],
      },
    };

    expect(() => instantiateScenario(scenario, mockContent)).toThrow(
      'Unknown object type: unknown',
    );
  });

  it('should use default z-index if not specified', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'token',
            ref: 'damage',
            pos: { x: 100, y: 200 },
            // No z specified
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);
    const token = objects.get('test:token:damage')!;

    expect(token._sortKey).toBeDefined();
  });

  it('should initialize common object properties', () => {
    const scenario: Scenario = {
      schema: 'ct-scenario@1',
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      packs: [],
      layout: {
        objects: [
          {
            type: 'token',
            ref: 'damage',
            pos: { x: 100, y: 200 },
          },
        ],
      },
    };

    const objects = instantiateScenario(scenario, mockContent);
    const token = objects.get('test:token:damage')!;

    expect(token._containerId).toBe(null);
    expect(token._locked).toBe(false);
    expect(token._selectedBy).toBe(null);
    expect(token._meta).toBeDefined();
  });
});
