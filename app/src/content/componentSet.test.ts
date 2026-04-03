import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameAssets, AssetPack, ComponentSet } from '@cardtable2/shared';
import {
  ObjectKind,
  type StackObject,
  type TokenObject,
} from '@cardtable2/shared';
import { resolveComponentSet, instantiateComponentSet } from './componentSet';

// ============================================================================
// Test Fixtures
// ============================================================================

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
    '01003': { type: 'hero', face: '01003.jpg' },
  },
  cardSets: {
    heroes: ['01001', '01002', '01003'],
  },
  tokens: {
    damage: { image: 'damage.png', size: 'medium' },
  },
  counters: {
    threat: { label: 'Threat', min: 0, max: 99, start: 5 },
  },
  mats: {
    playmat: { image: 'playmat.jpg', size: [1920, 1080] },
  },
};

const mockAssets: GameAssets = {
  packs: [mockPack],
  cardTypes: mockPack.cardTypes!,
  cards: mockPack.cards!,
  cardSets: mockPack.cardSets!,
  tokens: mockPack.tokens!,
  counters: mockPack.counters!,
  mats: mockPack.mats!,
  tokenTypes: {},
  statusTypes: {},
  modifierStats: {},
  iconTypes: {},
};

// ============================================================================
// resolveComponentSet Tests
// ============================================================================

describe('resolveComponentSet', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should expand stacks with deck definitions', () => {
    const set: ComponentSet = {
      stacks: [
        {
          label: 'Hero Deck',
          faceUp: false,
          deck: { cardSets: ['heroes'] },
        },
      ],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.stacks).toHaveLength(1);
    expect(resolved.stacks![0].cards).toEqual(['01001', '01002', '01003']);
  });

  it('should pass through stacks with pre-expanded cards', () => {
    const set: ComponentSet = {
      stacks: [
        {
          label: 'Imported Deck',
          faceUp: true,
          cards: ['01001', '01001', '01002'],
        },
      ],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.stacks![0].cards).toEqual(['01001', '01001', '01002']);
  });

  it('should prefer cards over deck when both are present', () => {
    const set: ComponentSet = {
      stacks: [
        {
          label: 'Mixed',
          faceUp: true,
          deck: { cardSets: ['heroes'] },
          cards: ['01001'],
        },
      ],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.stacks![0].cards).toEqual(['01001']);
  });

  it('should shuffle deck when shuffle is true', () => {
    const set: ComponentSet = {
      stacks: [
        {
          label: 'Shuffled',
          faceUp: false,
          deck: { cardSets: ['heroes'], shuffle: true },
        },
      ],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.stacks![0].cards).toHaveLength(3);
    expect(resolved.stacks![0].cards).toContain('01001');
    expect(resolved.stacks![0].cards).toContain('01002');
    expect(resolved.stacks![0].cards).toContain('01003');
  });

  it('should pass through tokens unchanged', () => {
    const set: ComponentSet = {
      tokens: [{ ref: 'damage', label: 'Damage Token' }],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.tokens).toEqual([{ ref: 'damage', label: 'Damage Token' }]);
  });

  it('should pass through counters unchanged', () => {
    const set: ComponentSet = {
      counters: [{ ref: 'threat', label: 'Threat Counter' }],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.counters).toEqual([
      { ref: 'threat', label: 'Threat Counter' },
    ]);
  });

  it('should pass through mats unchanged', () => {
    const set: ComponentSet = {
      mats: [{ ref: 'playmat' }],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.mats).toEqual([{ ref: 'playmat' }]);
  });

  it('should pass through zones unchanged', () => {
    const set: ComponentSet = {
      zones: [{ label: 'Discard', width: 150, height: 200 }],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.zones).toEqual([
      { label: 'Discard', width: 150, height: 200 },
    ]);
  });

  it('should handle empty component set', () => {
    const set: ComponentSet = {};

    const resolved = resolveComponentSet(set, mockAssets);

    expect(resolved.stacks).toBeUndefined();
    expect(resolved.tokens).toBeUndefined();
  });

  it('should warn and skip stacks with missing card set refs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const set: ComponentSet = {
      stacks: [
        {
          label: 'Bad Deck',
          faceUp: false,
          deck: { cardSets: ['nonexistent'] },
        },
      ],
    };

    const resolved = resolveComponentSet(set, mockAssets);

    expect(warnSpy).toHaveBeenCalled();
    expect(resolved.stacks).toHaveLength(0);

    warnSpy.mockRestore();
  });
});

// ============================================================================
// instantiateComponentSet Tests
// ============================================================================

describe('instantiateComponentSet', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should create StackObjects from resolved stacks', () => {
    const set: ComponentSet = {
      stacks: [
        {
          label: 'Hero Deck',
          faceUp: false,
          cards: ['01001', '01002'],
        },
      ],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(1);
    const [id, obj] = [...objects.entries()][0];
    const stack = obj as StackObject;

    expect(id).toBeDefined();
    expect(stack._kind).toBe(ObjectKind.Stack);
    expect(stack._cards).toEqual(['01001', '01002']);
    expect(stack._faceUp).toBe(false);
  });

  it('should create TokenObjects from resolved tokens', () => {
    const set: ComponentSet = {
      tokens: [{ ref: 'damage', label: 'Damage Token' }],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(1);
    const [, obj] = [...objects.entries()][0];
    const token = obj as TokenObject;

    expect(token._kind).toBe(ObjectKind.Token);
    expect(token._meta.tokenRef).toBe('damage');
    expect(token._meta.label).toBe('Damage Token');
    expect(token._faceUp).toBe(true);
  });

  it('should create Counter objects', () => {
    const set: ComponentSet = {
      counters: [{ ref: 'threat', label: 'Threat Counter' }],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(1);
    const [, obj] = [...objects.entries()][0];

    expect(obj._kind).toBe(ObjectKind.Counter);
    expect(obj._meta.counterRef).toBe('threat');
    expect(obj._meta.label).toBe('Threat Counter');
    expect(obj._meta.value).toBe(5);
    expect(obj._meta.min).toBe(0);
    expect(obj._meta.max).toBe(99);
  });

  it('should override counter start value when specified', () => {
    const set: ComponentSet = {
      counters: [{ ref: 'threat', value: 10 }],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    const [, obj] = [...objects.entries()][0];
    expect(obj._meta.value).toBe(10);
  });

  it('should create Mat objects', () => {
    const set: ComponentSet = {
      mats: [{ ref: 'playmat', label: 'Play Area' }],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(1);
    const [, obj] = [...objects.entries()][0];

    expect(obj._kind).toBe(ObjectKind.Mat);
    expect(obj._meta.matRef).toBe('playmat');
    expect(obj._meta.label).toBe('Play Area');
  });

  it('should create Zone objects', () => {
    const set: ComponentSet = {
      zones: [{ label: 'Discard Pile', width: 150, height: 200 }],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(1);
    const [, obj] = [...objects.entries()][0];

    expect(obj._kind).toBe(ObjectKind.Zone);
    expect(obj._meta.label).toBe('Discard Pile');
    expect(obj._meta.width).toBe(150);
    expect(obj._meta.height).toBe(200);
  });

  it('should generate unique UUID instance IDs', () => {
    const set: ComponentSet = {
      tokens: [
        { ref: 'damage', label: 'Token 1' },
        { ref: 'damage', label: 'Token 2' },
      ],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(2);
    const ids = [...objects.keys()];
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('should instantiate mixed object types', () => {
    const set: ComponentSet = {
      stacks: [{ label: 'Deck', faceUp: false, cards: ['01001'] }],
      tokens: [{ ref: 'damage' }],
      counters: [{ ref: 'threat' }],
      mats: [{ ref: 'playmat' }],
      zones: [{ label: 'Zone', width: 100, height: 100 }],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(5);

    const kinds = [...objects.values()].map((o) => o._kind);
    expect(kinds).toContain(ObjectKind.Stack);
    expect(kinds).toContain(ObjectKind.Token);
    expect(kinds).toContain(ObjectKind.Counter);
    expect(kinds).toContain(ObjectKind.Mat);
    expect(kinds).toContain(ObjectKind.Zone);
  });

  it('should handle empty component set', () => {
    const set: ComponentSet = {};

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);

    expect(objects.size).toBe(0);
  });

  it('should set common TableObject properties', () => {
    const set: ComponentSet = {
      tokens: [{ ref: 'damage' }],
    };

    const resolved = resolveComponentSet(set, mockAssets);
    const objects = instantiateComponentSet(resolved, mockAssets);
    const [, obj] = [...objects.entries()][0];

    expect(obj._containerId).toBe(null);
    expect(obj._locked).toBe(false);
    expect(obj._selectedBy).toBe(null);
    expect(obj._sortKey).toBeDefined();
    expect(obj._pos).toBeDefined();
  });
});
