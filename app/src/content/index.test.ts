import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findBlobUrl, replaceImagePathsWithBlobUrls } from './index';
import type { GameAssets } from '@cardtable2/shared';

/**
 * Helper: build a minimal GameAssets for testing.
 * Only the four attachment-type dictionaries (tokenTypes, statusTypes,
 * modifierStats, iconTypes) and the catalog fields are meaningful here.
 */
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

describe('findBlobUrl', () => {
  it('returns the direct-match blob URL when the path is a registered key', () => {
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:http://localhost:3000/damage-blob'],
      ['tokens/threat.png', 'blob:http://localhost:3000/threat-blob'],
    ]);

    expect(findBlobUrl('tokens/damage.png', imageUrls)).toBe(
      'blob:http://localhost:3000/damage-blob',
    );
    expect(findBlobUrl('tokens/threat.png', imageUrls)).toBe(
      'blob:http://localhost:3000/threat-blob',
    );
  });

  it('prefers direct match over suffix match when both are possible', () => {
    // "tokens/damage.png" is registered. A suffix-matching candidate
    // "damage.png" is also registered. A lookup for the exact full path
    // must return the direct match, not the suffix match.
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:direct'],
      ['damage.png', 'blob:suffix'],
    ]);

    expect(findBlobUrl('tokens/damage.png', imageUrls)).toBe('blob:direct');
  });

  it('suffix-matches a resolved URL whose tail is a registered relative path', () => {
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:http://localhost:3000/damage-blob'],
    ]);

    const resolved =
      'http://localhost:3001/api/card-image/plugin-id/tokens/damage.png';
    expect(findBlobUrl(resolved, imageUrls)).toBe(
      'blob:http://localhost:3000/damage-blob',
    );
  });

  it('requires a path boundary before the suffix (no "extra-damage.png" matching "damage.png")', () => {
    const imageUrls = new Map<string, string>([
      ['damage.png', 'blob:damage-blob'],
    ]);

    // The relative path "damage.png" should NOT match "extra-damage.png"
    // because the character before the suffix ('-') is not a path separator.
    expect(findBlobUrl('extra-damage.png', imageUrls)).toBeUndefined();
    expect(findBlobUrl('foo/extra-damage.png', imageUrls)).toBeUndefined();
  });

  it('treats a leading-"/" boundary as a valid match', () => {
    const imageUrls = new Map<string, string>([
      ['damage.png', 'blob:damage-blob'],
    ]);

    // Boundary is '/' — valid.
    expect(findBlobUrl('tokens/damage.png', imageUrls)).toBe(
      'blob:damage-blob',
    );
    expect(findBlobUrl('a/b/c/damage.png', imageUrls)).toBe('blob:damage-blob');
  });

  it('matches when imagePath equals the relative path exactly (no character before suffix)', () => {
    const imageUrls = new Map<string, string>([
      ['damage.png', 'blob:damage-blob'],
    ]);

    expect(findBlobUrl('damage.png', imageUrls)).toBe('blob:damage-blob');
  });

  it('returns undefined when no match exists', () => {
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:damage-blob'],
    ]);

    expect(findBlobUrl('tokens/missing.png', imageUrls)).toBeUndefined();
    expect(findBlobUrl('', imageUrls)).toBeUndefined();
    expect(findBlobUrl('completely/unrelated.png', imageUrls)).toBeUndefined();
  });

  it('returns undefined against an empty image map', () => {
    const imageUrls = new Map<string, string>();
    expect(findBlobUrl('tokens/damage.png', imageUrls)).toBeUndefined();
  });

  it('does not falsely match when relative path is longer than imagePath', () => {
    const imageUrls = new Map<string, string>([
      ['really/long/path/to/damage.png', 'blob:long-path-blob'],
    ]);

    // endsWith() returns false when the needle is longer than the haystack,
    // so there is no match and no out-of-bounds indexing.
    expect(findBlobUrl('damage.png', imageUrls)).toBeUndefined();
  });

  it('handles nested relative paths with multiple slashes', () => {
    const imageUrls = new Map<string, string>([
      ['icons/keywords/retaliate.png', 'blob:retaliate-blob'],
    ]);

    expect(
      findBlobUrl(
        'http://cdn.example.com/games/plugin/icons/keywords/retaliate.png',
        imageUrls,
      ),
    ).toBe('blob:retaliate-blob');
    // But a similar-looking path that doesn't end with the full suffix must fail.
    expect(
      findBlobUrl('http://cdn.example.com/keywords/retaliate.png', imageUrls),
    ).toBeUndefined();
  });
});

describe('replaceImagePathsWithBlobUrls', () => {
  // Silence info logs across every test; the warn spy is declared per-test
  // where its call history needs to be inspected.
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces tokenTypes image paths with blob URLs in place', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      tokenTypes: {
        damage: { name: 'Damage', image: 'tokens/damage.png' },
        threat: { name: 'Threat', image: 'tokens/threat.png' },
      },
    });
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:damage-blob'],
      ['tokens/threat.png', 'blob:threat-blob'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);

    expect(content.tokenTypes['damage']?.image).toBe('blob:damage-blob');
    expect(content.tokenTypes['threat']?.image).toBe('blob:threat-blob');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('replaces statusTypes image paths with blob URLs in place', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      statusTypes: {
        stunned: {
          name: 'Stunned',
          image: 'status/stunned.png',
        },
        confused: {
          name: 'Confused',
          image: 'status/confused.png',
        },
      },
    });
    const imageUrls = new Map<string, string>([
      ['status/stunned.png', 'blob:stunned-blob'],
      ['status/confused.png', 'blob:confused-blob'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);

    expect(content.statusTypes['stunned']?.image).toBe('blob:stunned-blob');
    expect(content.statusTypes['confused']?.image).toBe('blob:confused-blob');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('replaces iconTypes image paths with blob URLs in place', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      iconTypes: {
        retaliate: { name: 'Retaliate', image: 'icons/retaliate.png' },
        guard: { name: 'Guard', image: 'icons/guard.png' },
      },
    });
    const imageUrls = new Map<string, string>([
      ['icons/retaliate.png', 'blob:retaliate-blob'],
      ['icons/guard.png', 'blob:guard-blob'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);

    expect(content.iconTypes['retaliate']?.image).toBe('blob:retaliate-blob');
    expect(content.iconTypes['guard']?.image).toBe('blob:guard-blob');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('replaces paths across all three categories in a single call', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      tokenTypes: {
        damage: { name: 'Damage', image: 'tokens/damage.png' },
      },
      statusTypes: {
        stunned: { name: 'Stunned', image: 'status/stunned.png' },
      },
      iconTypes: {
        retaliate: { name: 'Retaliate', image: 'icons/retaliate.png' },
      },
    });
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:damage-blob'],
      ['status/stunned.png', 'blob:stunned-blob'],
      ['icons/retaliate.png', 'blob:retaliate-blob'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);

    expect(content.tokenTypes['damage']?.image).toBe('blob:damage-blob');
    expect(content.statusTypes['stunned']?.image).toBe('blob:stunned-blob');
    expect(content.iconTypes['retaliate']?.image).toBe('blob:retaliate-blob');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves already-resolved URLs via suffix matching', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      tokenTypes: {
        damage: {
          name: 'Damage',
          image:
            'http://localhost:3001/api/card-image/plugin/tokens/damage.png',
        },
      },
    });
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:damage-blob'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);

    expect(content.tokenTypes['damage']?.image).toBe('blob:damage-blob');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('leaves unmatched images untouched and warns with details', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      tokenTypes: {
        damage: { name: 'Damage', image: 'tokens/damage.png' },
        missing: { name: 'Missing', image: 'tokens/missing.png' },
      },
      statusTypes: {
        ghost: { name: 'Ghost', image: 'status/ghost.png' },
      },
    });
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:damage-blob'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);

    // Matched entry replaced.
    expect(content.tokenTypes['damage']?.image).toBe('blob:damage-blob');
    // Unmatched entries unchanged.
    expect(content.tokenTypes['missing']?.image).toBe('tokens/missing.png');
    expect(content.statusTypes['ghost']?.image).toBe('status/ghost.png');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = warnSpy.mock.calls[0] as [
      string,
      { unmatchedImages: Array<{ type: string; key: string; path: string }> },
    ];
    expect(message).toContain('2 attachment image(s)');
    expect(payload.unmatchedImages).toEqual(
      expect.arrayContaining([
        { type: 'token', key: 'missing', path: 'tokens/missing.png' },
        { type: 'status', key: 'ghost', path: 'status/ghost.png' },
      ]),
    );
  });

  it('does not warn when every image matches', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      tokenTypes: {
        damage: { name: 'Damage', image: 'tokens/damage.png' },
      },
    });
    const imageUrls = new Map<string, string>([
      ['tokens/damage.png', 'blob:damage-blob'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('handles the empty-assets case without errors or warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets();
    const imageUrls = new Map<string, string>();

    expect(() =>
      replaceImagePathsWithBlobUrls(content, imageUrls),
    ).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not mis-match "extra-damage.png" to a registered "damage.png"', () => {
    // Regression guard for the path-boundary check documented on findBlobUrl.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = createGameAssets({
      tokenTypes: {
        extra: { name: 'Extra Damage', image: 'tokens/extra-damage.png' },
      },
    });
    const imageUrls = new Map<string, string>([
      ['damage.png', 'blob:generic-damage'],
    ]);

    replaceImagePathsWithBlobUrls(content, imageUrls);

    // Must NOT have been replaced — "extra-damage.png" is not a path-boundary
    // suffix match for "damage.png".
    expect(content.tokenTypes['extra']?.image).toBe('tokens/extra-damage.png');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = warnSpy.mock.calls[0]?.[1] as {
      unmatchedImages: Array<{ type: string; key: string; path: string }>;
    };
    expect(payload.unmatchedImages).toContainEqual({
      type: 'token',
      key: 'extra',
      path: 'tokens/extra-damage.png',
    });
  });
});
