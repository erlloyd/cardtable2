import { describe, it, expect } from 'vitest';
import { getCardOrientation, getCardOrientationByCode } from './utils';
import type {
  Card,
  CardType,
  GameAssets,
  OrientationRule,
} from '@cardtable2/shared';

const createGameAssets = (
  cardTypes: Record<string, CardType> = {},
  cards: Record<string, Card> = {},
  orientationRules: OrientationRule[] = [],
): GameAssets => ({
  packs: [],
  cardTypes,
  cards,
  cardSets: {},
  tokens: {},
  counters: {},
  mats: {},
  tokenTypes: {},
  statusTypes: {},
  modifierStats: {},
  iconTypes: {},
  orientationRules,
});

describe('getCardOrientation', () => {
  describe('Card-level override (layer 1)', () => {
    it('returns landscape when card has explicit landscape orientation', () => {
      const gameAssets = createGameAssets(
        {},
        {
          testCard: {
            type: 'hero',
            face: 'face.jpg',
            orientation: 'landscape',
          },
        },
      );

      expect(getCardOrientation(gameAssets.cards['testCard'], gameAssets)).toBe(
        'landscape',
      );
    });

    it('returns portrait when card has explicit portrait orientation', () => {
      const gameAssets = createGameAssets(
        {},
        {
          testCard: {
            type: 'hero',
            face: 'face.jpg',
            orientation: 'portrait',
          },
        },
      );

      expect(getCardOrientation(gameAssets.cards['testCard'], gameAssets)).toBe(
        'portrait',
      );
    });

    it('card-level orientation overrides any matching rule', () => {
      const gameAssets = createGameAssets(
        {},
        {
          testCard: {
            type: 'villain',
            face: 'face.jpg',
            orientation: 'portrait', // Card-level wins
          },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      expect(getCardOrientation(gameAssets.cards['testCard'], gameAssets)).toBe(
        'portrait',
      );
    });

    it('card-level auto falls through to rules', () => {
      const gameAssets = createGameAssets(
        {},
        {
          testCard: {
            type: 'villain',
            face: 'face.jpg',
            orientation: 'auto', // 'auto' = no opinion
          },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      expect(getCardOrientation(gameAssets.cards['testCard'], gameAssets)).toBe(
        'landscape',
      );
    });
  });

  describe('Orientation rules (layer 2)', () => {
    it('returns landscape when a single-key rule matches on type', () => {
      const gameAssets = createGameAssets(
        {},
        {
          rhino: { type: 'villain', face: 'rhino.jpg' },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      expect(getCardOrientation(gameAssets.cards['rhino'], gameAssets)).toBe(
        'landscape',
      );
    });

    it('returns portrait fallback when no rule matches', () => {
      const gameAssets = createGameAssets(
        {},
        {
          ally: { type: 'ally', face: 'ally.jpg' },
        },
        [{ match: { type: 'villain' }, orientation: 'landscape' }],
      );

      expect(getCardOrientation(gameAssets.cards['ally'], gameAssets)).toBe(
        'portrait',
      );
    });

    it('matches on a non-type field (typeCode)', () => {
      // This is the motivating case from the spec: cards with type=encounter
      // but typeCode=side_scheme should render landscape, while other encounter
      // cards stay portrait.
      const gameAssets = createGameAssets(
        {},
        {
          sideScheme: {
            type: 'encounter',
            typeCode: 'side_scheme',
            face: 'ss.jpg',
          },
          obligation: {
            type: 'encounter',
            typeCode: 'obligation',
            face: 'ob.jpg',
          },
        },
        [{ match: { typeCode: 'side_scheme' }, orientation: 'landscape' }],
      );

      expect(
        getCardOrientation(gameAssets.cards['sideScheme'], gameAssets),
      ).toBe('landscape');
      expect(
        getCardOrientation(gameAssets.cards['obligation'], gameAssets),
      ).toBe('portrait');
    });

    it('multi-key match: ALL keys must match (AND semantics)', () => {
      const rules: OrientationRule[] = [
        {
          match: { type: 'encounter', setCode: 'rhino_nemesis' },
          orientation: 'landscape',
        },
      ];
      const gameAssets = createGameAssets(
        {},
        {
          // both keys match — should be landscape
          rhinoEnc: {
            type: 'encounter',
            setCode: 'rhino_nemesis',
            face: 'r.jpg',
          },
          // only `type` matches — should fall through to portrait
          klawEnc: {
            type: 'encounter',
            setCode: 'klaw_nemesis',
            face: 'k.jpg',
          },
          // only `setCode` matches — should fall through to portrait
          rhinoOther: {
            type: 'ally',
            setCode: 'rhino_nemesis',
            face: 'ro.jpg',
          },
        },
        rules,
      );

      expect(getCardOrientation(gameAssets.cards['rhinoEnc'], gameAssets)).toBe(
        'landscape',
      );
      expect(getCardOrientation(gameAssets.cards['klawEnc'], gameAssets)).toBe(
        'portrait',
      );
      expect(
        getCardOrientation(gameAssets.cards['rhinoOther'], gameAssets),
      ).toBe('portrait');
    });

    it('first-match-wins when multiple rules match the same card', () => {
      const gameAssets = createGameAssets(
        {},
        {
          card: { type: 'encounter', typeCode: 'side_scheme', face: 'c.jpg' },
        },
        [
          // First rule fires — even though the second rule would also match.
          { match: { type: 'encounter' }, orientation: 'portrait' },
          { match: { typeCode: 'side_scheme' }, orientation: 'landscape' },
        ],
      );

      expect(getCardOrientation(gameAssets.cards['card'], gameAssets)).toBe(
        'portrait',
      );
    });

    it("rule with orientation='auto' falls through to the next rule", () => {
      const gameAssets = createGameAssets(
        {},
        {
          card: { type: 'main_scheme', face: 'c.jpg' },
        },
        [
          // First rule matches structurally but returns 'auto' = "no opinion".
          { match: { type: 'main_scheme' }, orientation: 'auto' },
          // The walk continues; this matches and wins.
          { match: { type: 'main_scheme' }, orientation: 'landscape' },
        ],
      );

      expect(getCardOrientation(gameAssets.cards['card'], gameAssets)).toBe(
        'landscape',
      );
    });

    it("rule with orientation='auto' and no later match falls back to portrait", () => {
      const gameAssets = createGameAssets(
        {},
        {
          card: { type: 'main_scheme', face: 'c.jpg' },
        },
        [{ match: { type: 'main_scheme' }, orientation: 'auto' }],
      );

      expect(getCardOrientation(gameAssets.cards['card'], gameAssets)).toBe(
        'portrait',
      );
    });

    it('empty match object matches every card (catch-all rule)', () => {
      const gameAssets = createGameAssets(
        {},
        {
          anyCard: { type: 'whatever', face: 'a.jpg' },
        },
        // A rule with no match keys is vacuously satisfied by any card.
        [{ match: {}, orientation: 'landscape' }],
      );

      expect(getCardOrientation(gameAssets.cards['anyCard'], gameAssets)).toBe(
        'landscape',
      );
    });
  });

  describe('Backwards compatibility / fallback (layer 3)', () => {
    it('returns portrait when no rules block is supplied', () => {
      // Plugins that have not migrated yet still get a sane default.
      const gameAssets = createGameAssets(
        {},
        {
          card: { type: 'hero', face: 'h.jpg' },
        },
        // empty orientationRules, simulating a pre-migration plugin
      );

      expect(getCardOrientation(gameAssets.cards['card'], gameAssets)).toBe(
        'portrait',
      );
    });

    it('IGNORES the deprecated cardType.orientation field', () => {
      // The old cardType-keyed lookup is gone. A pre-migration plugin that
      // still sets cardTypes.X.orientation gets portrait (the runtime warns
      // separately via mergeAssetPacks; this test pins the resolver behavior).
      const gameAssets = createGameAssets(
        {
          main_scheme: { orientation: 'landscape' }, // deprecated, ignored
        },
        {
          card: { type: 'main_scheme', face: 'm.jpg' },
        },
      );

      expect(getCardOrientation(gameAssets.cards['card'], gameAssets)).toBe(
        'portrait',
      );
    });

    it('returns portrait when card has no orientation and no rules match', () => {
      const gameAssets = createGameAssets(
        {},
        {
          card: { type: 'unknown', face: 'u.jpg' },
        },
      );

      expect(getCardOrientation(gameAssets.cards['card'], gameAssets)).toBe(
        'portrait',
      );
    });
  });

  describe('Mixed scenarios', () => {
    it('handles a realistic Marvel Champions migration: main_scheme + side_scheme', () => {
      // Models the post-migration state of the MC plugin (mc-yta).
      const rules: OrientationRule[] = [
        { match: { typeCode: 'side_scheme' }, orientation: 'landscape' },
        { match: { type: 'main_scheme' }, orientation: 'landscape' },
      ];
      const gameAssets = createGameAssets(
        {},
        {
          mainScheme: { type: 'main_scheme', face: 'ms.jpg' },
          sideScheme: {
            type: 'encounter',
            typeCode: 'side_scheme',
            face: 'ss.jpg',
          },
          encounter: {
            type: 'encounter',
            typeCode: 'obligation',
            face: 'ob.jpg',
          },
          hero: { type: 'hero', face: 'h.jpg' },
          // Per-card override beats every rule
          weirdHero: {
            type: 'hero',
            face: 'wh.jpg',
            orientation: 'landscape',
          },
        },
        rules,
      );

      expect(
        getCardOrientation(gameAssets.cards['mainScheme'], gameAssets),
      ).toBe('landscape');
      expect(
        getCardOrientation(gameAssets.cards['sideScheme'], gameAssets),
      ).toBe('landscape');
      expect(
        getCardOrientation(gameAssets.cards['encounter'], gameAssets),
      ).toBe('portrait');
      expect(getCardOrientation(gameAssets.cards['hero'], gameAssets)).toBe(
        'portrait',
      );
      expect(
        getCardOrientation(gameAssets.cards['weirdHero'], gameAssets),
      ).toBe('landscape');
    });
  });
});

describe('getCardOrientationByCode', () => {
  it('returns landscape for a card whose type matches a landscape rule', () => {
    const gameAssets = createGameAssets(
      {},
      {
        mc01_rhino: { type: 'villain', face: 'rhino.jpg' },
      },
      [{ match: { type: 'villain' }, orientation: 'landscape' }],
    );

    expect(getCardOrientationByCode('mc01_rhino', gameAssets)).toBe(
      'landscape',
    );
  });

  it('returns portrait for a card with no matching rule', () => {
    const gameAssets = createGameAssets(
      {},
      {
        mc01_spiderman: { type: 'hero', face: 'spiderman.jpg' },
      },
      [{ match: { type: 'villain' }, orientation: 'landscape' }],
    );

    expect(getCardOrientationByCode('mc01_spiderman', gameAssets)).toBe(
      'portrait',
    );
  });

  it('returns null when card code does not exist', () => {
    const gameAssets = createGameAssets();
    expect(getCardOrientationByCode('nonexistent', gameAssets)).toBeNull();
  });

  it('returns portrait when no rules block is supplied', () => {
    const gameAssets = createGameAssets(
      {},
      {
        mc01_spiderman: { type: 'hero', face: 'spiderman.jpg' },
      },
    );

    expect(getCardOrientationByCode('mc01_spiderman', gameAssets)).toBe(
      'portrait',
    );
  });

  it('handles multiple lookups consistently', () => {
    const gameAssets = createGameAssets(
      {},
      {
        villain1: { type: 'villain', face: 'v1.jpg' },
        villain2: { type: 'villain', face: 'v2.jpg' },
        hero1: { type: 'hero', face: 'h1.jpg' },
      },
      [
        { match: { type: 'villain' }, orientation: 'landscape' },
        { match: { type: 'hero' }, orientation: 'portrait' },
      ],
    );

    expect(getCardOrientationByCode('villain1', gameAssets)).toBe('landscape');
    expect(getCardOrientationByCode('villain2', gameAssets)).toBe('landscape');
    expect(getCardOrientationByCode('hero1', gameAssets)).toBe('portrait');
    expect(getCardOrientationByCode('nonexistent', gameAssets)).toBeNull();
  });
});
