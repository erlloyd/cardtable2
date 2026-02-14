import { describe, it, expect } from 'vitest';
import { getCardOrientation, getCardOrientationByCode } from './utils';
import type { Card, CardType, GameAssets } from '@cardtable2/shared';

describe('getCardOrientation', () => {
  const createGameAssets = (
    cardTypes: Record<string, CardType> = {},
    cards: Record<string, Card> = {},
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
  });

  describe('Card-level override', () => {
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

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('landscape');
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

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('portrait');
    });

    it('overrides cardType orientation with card-level landscape', () => {
      const gameAssets = createGameAssets(
        {
          hero: { orientation: 'portrait' },
        },
        {
          testCard: {
            type: 'hero',
            face: 'face.jpg',
            orientation: 'landscape', // Override type
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('landscape');
    });

    it('overrides cardType orientation with card-level portrait', () => {
      const gameAssets = createGameAssets(
        {
          villain: { orientation: 'landscape' },
        },
        {
          testCard: {
            type: 'villain',
            face: 'face.jpg',
            orientation: 'portrait', // Override type
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('portrait');
    });
  });

  describe('CardType default orientation', () => {
    it('returns landscape from cardType when card has no orientation', () => {
      const gameAssets = createGameAssets(
        {
          villain: { orientation: 'landscape' },
        },
        {
          testCard: {
            type: 'villain',
            face: 'face.jpg',
            // No card-level orientation
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('landscape');
    });

    it('returns portrait from cardType when card has no orientation', () => {
      const gameAssets = createGameAssets(
        {
          hero: { orientation: 'portrait' },
        },
        {
          testCard: {
            type: 'hero',
            face: 'face.jpg',
            // No card-level orientation
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('portrait');
    });

    it('uses cardType orientation when different cards share the same type', () => {
      const gameAssets = createGameAssets(
        {
          villain: { orientation: 'landscape' },
        },
        {
          rhino: { type: 'villain', face: 'rhino.jpg' },
          klaw: { type: 'villain', face: 'klaw.jpg' },
          ultron: { type: 'villain', face: 'ultron.jpg' },
        },
      );

      expect(getCardOrientation(gameAssets.cards['rhino'], gameAssets)).toBe(
        'landscape',
      );
      expect(getCardOrientation(gameAssets.cards['klaw'], gameAssets)).toBe(
        'landscape',
      );
      expect(getCardOrientation(gameAssets.cards['ultron'], gameAssets)).toBe(
        'landscape',
      );
    });
  });

  describe('Default to portrait', () => {
    it('returns portrait when card and cardType have no orientation', () => {
      const gameAssets = createGameAssets(
        {
          hero: {}, // No orientation
        },
        {
          testCard: {
            type: 'hero',
            face: 'face.jpg',
            // No orientation
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('portrait');
    });

    it('returns portrait when cardType does not exist', () => {
      const gameAssets = createGameAssets(
        {}, // No cardTypes defined
        {
          testCard: {
            type: 'nonexistent',
            face: 'face.jpg',
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('portrait');
    });

    it('returns portrait for empty gameAssets', () => {
      const gameAssets = createGameAssets();
      const card: Card = {
        type: 'unknown',
        face: 'face.jpg',
      };

      const orientation = getCardOrientation(card, gameAssets);
      expect(orientation).toBe('portrait');
    });
  });

  describe('Auto orientation handling', () => {
    it('treats card-level auto as portrait (future enhancement)', () => {
      const gameAssets = createGameAssets(
        {},
        {
          testCard: {
            type: 'hero',
            face: 'face.jpg',
            orientation: 'auto',
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('portrait');
    });

    it('treats cardType-level auto as portrait (future enhancement)', () => {
      const gameAssets = createGameAssets(
        {
          hero: { orientation: 'auto' },
        },
        {
          testCard: {
            type: 'hero',
            face: 'face.jpg',
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('portrait');
    });

    it('falls through auto to check cardType when card has auto', () => {
      const gameAssets = createGameAssets(
        {
          villain: { orientation: 'landscape' },
        },
        {
          testCard: {
            type: 'villain',
            face: 'face.jpg',
            orientation: 'auto', // Falls through to check type
          },
        },
      );

      const orientation = getCardOrientation(
        gameAssets.cards['testCard'],
        gameAssets,
      );
      expect(orientation).toBe('landscape');
    });
  });

  describe('Complex inheritance scenarios', () => {
    it('handles mixed orientation across multiple card types', () => {
      const gameAssets = createGameAssets(
        {
          villain: { orientation: 'landscape' },
          hero: { orientation: 'portrait' },
          ally: {}, // No orientation
        },
        {
          rhino: { type: 'villain', face: 'rhino.jpg' },
          spiderman: { type: 'hero', face: 'spiderman.jpg' },
          blackcat: { type: 'ally', face: 'blackcat.jpg' },
          specialVillain: {
            type: 'villain',
            face: 'special.jpg',
            orientation: 'portrait', // Override
          },
        },
      );

      expect(getCardOrientation(gameAssets.cards['rhino'], gameAssets)).toBe(
        'landscape',
      );
      expect(
        getCardOrientation(gameAssets.cards['spiderman'], gameAssets),
      ).toBe('portrait');
      expect(getCardOrientation(gameAssets.cards['blackcat'], gameAssets)).toBe(
        'portrait',
      ); // Default
      expect(
        getCardOrientation(gameAssets.cards['specialVillain'], gameAssets),
      ).toBe('portrait'); // Override
    });
  });
});

describe('getCardOrientationByCode', () => {
  const createGameAssets = (
    cardTypes: Record<string, CardType> = {},
    cards: Record<string, Card> = {},
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
  });

  it('returns landscape for card with landscape orientation', () => {
    const gameAssets = createGameAssets(
      {
        villain: { orientation: 'landscape' },
      },
      {
        mc01_rhino: { type: 'villain', face: 'rhino.jpg' },
      },
    );

    const orientation = getCardOrientationByCode('mc01_rhino', gameAssets);
    expect(orientation).toBe('landscape');
  });

  it('returns portrait for card with portrait orientation', () => {
    const gameAssets = createGameAssets(
      {
        hero: { orientation: 'portrait' },
      },
      {
        mc01_spiderman: { type: 'hero', face: 'spiderman.jpg' },
      },
    );

    const orientation = getCardOrientationByCode('mc01_spiderman', gameAssets);
    expect(orientation).toBe('portrait');
  });

  it('returns null when card code does not exist', () => {
    const gameAssets = createGameAssets();

    const orientation = getCardOrientationByCode('nonexistent', gameAssets);
    expect(orientation).toBeNull();
  });

  it('returns portrait by default when card has no orientation', () => {
    const gameAssets = createGameAssets(
      {
        hero: {}, // No orientation
      },
      {
        mc01_spiderman: { type: 'hero', face: 'spiderman.jpg' },
      },
    );

    const orientation = getCardOrientationByCode('mc01_spiderman', gameAssets);
    expect(orientation).toBe('portrait');
  });

  it('handles multiple lookups correctly', () => {
    const gameAssets = createGameAssets(
      {
        villain: { orientation: 'landscape' },
        hero: { orientation: 'portrait' },
      },
      {
        villain1: { type: 'villain', face: 'v1.jpg' },
        villain2: { type: 'villain', face: 'v2.jpg' },
        hero1: { type: 'hero', face: 'h1.jpg' },
      },
    );

    expect(getCardOrientationByCode('villain1', gameAssets)).toBe('landscape');
    expect(getCardOrientationByCode('villain2', gameAssets)).toBe('landscape');
    expect(getCardOrientationByCode('hero1', gameAssets)).toBe('portrait');
    expect(getCardOrientationByCode('nonexistent', gameAssets)).toBeNull();
  });
});
