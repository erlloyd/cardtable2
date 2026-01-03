import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  AssetPack,
  Scenario,
  MergedContent,
  CardSize,
} from '@cardtable2/shared';
import {
  loadAssetPack,
  loadAssetPacks,
  loadScenario,
  mergeAssetPacks,
  resolveAssetUrl,
  resolveCard,
  resolveAllCards,
  getCardDimensions,
} from './loader';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockAssetPack1: AssetPack = {
  schema: 'ct-assets@1',
  id: 'test-pack-1',
  name: 'Test Pack 1',
  version: '1.0.0',
  baseUrl: 'https://example.com/pack1/',
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
      back: 'custom_back.jpg',
    },
  },
  cardSets: {
    heroes: ['01001', '01002'],
  },
  tokens: {
    damage: {
      image: 'damage.png',
      size: 'medium',
    },
  },
};

const mockAssetPack2: AssetPack = {
  schema: 'ct-assets@1',
  id: 'test-pack-2',
  name: 'Test Pack 2',
  version: '1.0.0',
  baseUrl: 'https://example.com/pack2/',
  cardTypes: {
    villain: {
      back: 'villain_back.jpg',
      size: 'tarot',
    },
  },
  cards: {
    '01001': {
      // Override from pack 1
      type: 'hero',
      face: '01001_alt.jpg',
    },
    '02001': {
      type: 'villain',
      face: '02001.jpg',
    },
  },
  counters: {
    threat: {
      label: 'Threat',
      min: 0,
      max: 99,
      start: 0,
    },
  },
};

const mockScenario: Scenario = {
  schema: 'ct-scenario@1',
  id: 'test-scenario',
  name: 'Test Scenario',
  version: '1.0.0',
  packs: ['test-pack-1', 'test-pack-2'],
  decks: {
    playerDeck: {
      cardSets: ['heroes'],
      shuffle: true,
    },
  },
  layout: {
    objects: [],
  },
};

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('@/utils/backend', () => ({
  getBackendUrl: vi.fn(() => 'http://localhost:3001'),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// loadAssetPack Tests
// ============================================================================

describe('loadAssetPack', () => {
  it('should load and validate a valid asset pack', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAssetPack1),
    });

    const pack = await loadAssetPack('https://example.com/pack.json');

    expect(pack).toEqual(mockAssetPack1);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/pack.json');
  });

  it('should throw error for HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(
      loadAssetPack('https://example.com/missing.json'),
    ).rejects.toThrow('Failed to load asset pack');
  });

  it('should throw error for invalid schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          schema: 'wrong-schema',
          id: 'test',
          name: 'Test',
          version: '1.0.0',
        }),
    });

    await expect(
      loadAssetPack('https://example.com/invalid.json'),
    ).rejects.toThrow('Invalid schema');
  });

  it('should throw error for missing required fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          schema: 'ct-assets@1',
          // Missing id, name, version
        }),
    });

    await expect(
      loadAssetPack('https://example.com/incomplete.json'),
    ).rejects.toThrow('Missing required fields');
  });

  it('should throw error for non-object response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve('not an object'),
    });

    await expect(
      loadAssetPack('https://example.com/invalid.json'),
    ).rejects.toThrow('Invalid asset pack');
  });
});

// ============================================================================
// loadAssetPacks Tests
// ============================================================================

describe('loadAssetPacks', () => {
  it('should load multiple packs in parallel', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAssetPack1),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAssetPack2),
      });

    const packs = await loadAssetPacks([
      'https://example.com/pack1.json',
      'https://example.com/pack2.json',
    ]);

    expect(packs).toHaveLength(2);
    expect(packs[0]).toEqual(mockAssetPack1);
    expect(packs[1]).toEqual(mockAssetPack2);
  });

  it('should fail if any pack fails to load', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAssetPack1),
      })
      .mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

    await expect(
      loadAssetPacks([
        'https://example.com/pack1.json',
        'https://example.com/missing.json',
      ]),
    ).rejects.toThrow();
  });
});

// ============================================================================
// loadScenario Tests
// ============================================================================

describe('loadScenario', () => {
  it('should load and validate a valid scenario', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockScenario),
    });

    const scenario = await loadScenario('https://example.com/scenario.json');

    expect(scenario).toEqual(mockScenario);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/scenario.json');
  });

  it('should throw error for HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(
      loadScenario('https://example.com/missing.json'),
    ).rejects.toThrow('Failed to load scenario');
  });

  it('should throw error for invalid schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          schema: 'wrong-schema',
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          packs: [],
        }),
    });

    await expect(
      loadScenario('https://example.com/invalid.json'),
    ).rejects.toThrow('Invalid schema');
  });

  it('should throw error for missing required fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          schema: 'ct-scenario@1',
          // Missing id, name, version, packs
        }),
    });

    await expect(
      loadScenario('https://example.com/incomplete.json'),
    ).rejects.toThrow('Missing required fields');
  });
});

// ============================================================================
// mergeAssetPacks Tests
// ============================================================================

describe('mergeAssetPacks', () => {
  it('should merge multiple packs with last-wins strategy', () => {
    const merged = mergeAssetPacks([mockAssetPack1, mockAssetPack2]);

    expect(merged.packs).toHaveLength(2);
    expect(merged.cardTypes).toEqual({
      hero: mockAssetPack1.cardTypes!.hero,
      villain: mockAssetPack2.cardTypes!.villain,
    });
    expect(merged.cards['01001']).toEqual(mockAssetPack2.cards!['01001']); // Pack 2 wins
    expect(merged.cards['01002']).toEqual(mockAssetPack1.cards!['01002']);
    expect(merged.cards['02001']).toEqual(mockAssetPack2.cards!['02001']);
    expect(merged.tokens).toEqual(mockAssetPack1.tokens);
    expect(merged.counters).toEqual(mockAssetPack2.counters);
  });

  it('should handle packs with missing optional fields', () => {
    const minimalPack: AssetPack = {
      schema: 'ct-assets@1',
      id: 'minimal',
      name: 'Minimal',
      version: '1.0.0',
      // No cards, tokens, etc.
    };

    const merged = mergeAssetPacks([minimalPack, mockAssetPack1]);

    expect(merged.cards).toEqual(mockAssetPack1.cards);
    expect(merged.tokens).toEqual(mockAssetPack1.tokens);
  });

  it('should return empty collections for empty pack list', () => {
    const merged = mergeAssetPacks([]);

    expect(merged.packs).toHaveLength(0);
    expect(merged.cards).toEqual({});
    expect(merged.tokens).toEqual({});
  });
});

// ============================================================================
// resolveAssetUrl Tests
// ============================================================================

describe('resolveAssetUrl', () => {
  it('should return absolute http URLs as-is', () => {
    const url = 'http://example.com/image.jpg';
    expect(resolveAssetUrl(url)).toBe(url);
  });

  it('should return absolute https URLs as-is', () => {
    const url = 'https://example.com/image.jpg';
    expect(resolveAssetUrl(url)).toBe(url);
  });

  it('should prepend backend URL for /api/ paths', () => {
    const url = '/api/card-image/test.jpg';
    expect(resolveAssetUrl(url)).toBe(
      'http://localhost:3001/api/card-image/test.jpg',
    );
  });

  it('should return non-API root-relative paths as-is', () => {
    const url = '/images/test.jpg';
    expect(resolveAssetUrl(url)).toBe(url);
  });

  it('should combine relative URL with baseUrl', () => {
    const url = 'card.jpg';
    const baseUrl = 'https://example.com/cards/';
    expect(resolveAssetUrl(url, baseUrl)).toBe(
      'https://example.com/cards/card.jpg',
    );
  });

  it('should handle baseUrl without trailing slash', () => {
    const url = 'card.jpg';
    const baseUrl = 'https://example.com/cards';
    expect(resolveAssetUrl(url, baseUrl)).toBe(
      'https://example.com/cards/card.jpg',
    );
  });

  it('should prepend backend URL for API paths resolved from baseUrl', () => {
    const url = '01001.jpg';
    const baseUrl = '/api/card-image/pack1/';
    expect(resolveAssetUrl(url, baseUrl)).toBe(
      'http://localhost:3001/api/card-image/pack1/01001.jpg',
    );
  });

  it('should return relative URL as-is if no baseUrl', () => {
    const url = 'card.jpg';
    expect(resolveAssetUrl(url)).toBe(url);
  });
});

// ============================================================================
// resolveCard Tests
// ============================================================================

describe('resolveCard', () => {
  const content: MergedContent = {
    packs: [mockAssetPack1],
    cardTypes: mockAssetPack1.cardTypes ?? {},
    cards: mockAssetPack1.cards ?? {},
    cardSets: {},
    tokens: {},
    counters: {},
    mats: {},
  };

  it('should resolve card with type inheritance', () => {
    const resolved = resolveCard('01001', content);

    expect(resolved).toEqual({
      code: '01001',
      type: 'hero',
      face: 'https://example.com/pack1/01001.jpg',
      back: 'https://example.com/pack1/hero_back.jpg',
      size: 'standard',
    });
  });

  it('should use card-specific back if provided', () => {
    const resolved = resolveCard('01002', content);

    expect(resolved.back).toBe('https://example.com/pack1/custom_back.jpg');
  });

  it('should throw error for missing card', () => {
    expect(() => resolveCard('99999', content)).toThrow(
      'Card not found: 99999',
    );
  });

  it('should throw error for missing card type', () => {
    const invalidContent: MergedContent = {
      ...content,
      cards: {
        invalid: {
          type: 'nonexistent',
          face: 'test.jpg',
        },
      },
    };

    expect(() => resolveCard('invalid', invalidContent)).toThrow(
      'Card type not found: nonexistent',
    );
  });

  it('should throw error for missing back image', () => {
    const invalidContent: MergedContent = {
      ...content,
      cardTypes: {
        noback: {
          size: 'standard',
          // No back defined
        },
      },
      cards: {
        invalid: {
          type: 'noback',
          face: 'test.jpg',
        },
      },
    };

    expect(() => resolveCard('invalid', invalidContent)).toThrow(
      'No back image defined',
    );
  });

  it('should use size from card if specified', () => {
    const contentWithCustomSize: MergedContent = {
      ...content,
      cards: {
        custom: {
          type: 'hero',
          face: 'custom.jpg',
          size: 'jumbo',
        },
      },
    };

    const resolved = resolveCard('custom', contentWithCustomSize);
    expect(resolved.size).toBe('jumbo');
  });

  it('should use custom size array from card', () => {
    const contentWithCustomSize: MergedContent = {
      ...content,
      cards: {
        custom: {
          type: 'hero',
          face: 'custom.jpg',
          size: [300, 400],
        },
      },
    };

    const resolved = resolveCard('custom', contentWithCustomSize);
    expect(resolved.size).toEqual([300, 400]);
  });
});

// ============================================================================
// resolveAllCards Tests
// ============================================================================

describe('resolveAllCards', () => {
  it('should resolve all cards in content', () => {
    const content: MergedContent = {
      packs: [mockAssetPack1],
      cardTypes: mockAssetPack1.cardTypes ?? {},
      cards: mockAssetPack1.cards ?? {},
      cardSets: {},
      tokens: {},
      counters: {},
      mats: {},
    };

    const resolved = resolveAllCards(content);

    expect(resolved.size).toBe(2);
    expect(resolved.has('01001')).toBe(true);
    expect(resolved.has('01002')).toBe(true);

    const card1 = resolved.get('01001')!;
    expect(card1.face).toBe('https://example.com/pack1/01001.jpg');
  });

  it('should return empty map for no cards', () => {
    const emptyContent: MergedContent = {
      packs: [],
      cardTypes: {},
      cards: {},
      cardSets: {},
      tokens: {},
      counters: {},
      mats: {},
    };

    const resolved = resolveAllCards(emptyContent);
    expect(resolved.size).toBe(0);
  });
});

// ============================================================================
// getCardDimensions Tests
// ============================================================================

describe('getCardDimensions', () => {
  it('should return standard dimensions', () => {
    expect(getCardDimensions('standard')).toEqual([180, 252]);
  });

  it('should return bridge dimensions', () => {
    expect(getCardDimensions('bridge')).toEqual([144, 252]);
  });

  it('should return tarot dimensions', () => {
    expect(getCardDimensions('tarot')).toEqual([180, 324]);
  });

  it('should return mini dimensions', () => {
    expect(getCardDimensions('mini')).toEqual([108, 151]);
  });

  it('should return jumbo dimensions', () => {
    expect(getCardDimensions('jumbo')).toEqual([270, 378]);
  });

  it('should return custom dimensions array as-is', () => {
    expect(getCardDimensions([300, 400])).toEqual([300, 400]);
  });

  it('should default to standard for unknown size', () => {
    // Test with an unknown size (bypassing type safety to test error handling)
     
    expect(getCardDimensions('unknown' as CardSize)).toEqual([180, 252]);
  });
});
