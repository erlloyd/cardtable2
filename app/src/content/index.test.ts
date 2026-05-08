import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findBlobUrl,
  loadLocalPluginScenario,
  loadScenarioFromPlugin,
  replaceImagePathsWithBlobUrls,
} from './index';
import { __resetPluginCacheForTests } from './pluginLoader';
import type { GameAssets, Scenario } from '@cardtable2/shared';

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

// ============================================================================
// loadScenarioFromPlugin Tests
// ============================================================================

describe('loadScenarioFromPlugin', () => {
  let originalFetch: typeof global.fetch;

  const pluginRegistry = {
    plugins: [
      {
        id: 'test-plugin',
        name: 'Test Plugin',
        author: 'Test',
        description: 'desc',
        baseUrl: 'https://example.com/plugins/test/',
        boxArt: 'https://example.com/plugins/test/box.png',
      },
    ],
  };

  const pluginManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    assets: ['pack-a.json', 'pack-b.json'],
    scenarios: ['scenario-1.json'],
  };

  const scenarioJson: Scenario = {
    schema: 'ct-scenario@2',
    id: 'scenario-1',
    name: 'Test Scenario',
    version: '1.0.0',
    packs: [],
  };

  beforeEach(() => {
    __resetPluginCacheForTests();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not fetch or merge asset packs', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/pluginsIndex.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(pluginRegistry),
        });
      }
      if (url.endsWith('index.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(pluginManifest),
        });
      }
      if (url.endsWith('scenario-1.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(scenarioJson),
        });
      }
      throw new Error(
        `Unexpected fetch in loadScenarioFromPlugin test: ${url}`,
      );
    });
    global.fetch = fetchMock;

    const gameAssets: GameAssets = {
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
    };

    const result = await loadScenarioFromPlugin(
      'test-plugin',
      'scenario-1.json',
      gameAssets,
    );

    // Returned content reuses the supplied gameAssets reference (no new merge).
    expect(result.content).toBe(gameAssets);
    expect(result.scenario).toEqual(scenarioJson);

    // No pack URLs were fetched. Allowed: registry, manifest, scenario JSON.
    // This is the whole point of the split — scenario load is pure.
    const fetchedUrls = fetchMock.mock.calls.map((call) => call[0] as string);
    const packUrls = fetchedUrls.filter((u) => u.includes('pack-'));
    expect(packUrls).toHaveLength(0);

    // The exact set of fetches should be: registry + plugin manifest + scenario.
    expect(fetchedUrls).toHaveLength(3);
    expect(fetchedUrls).toContain('/pluginsIndex.json');
    expect(
      fetchedUrls.some(
        (u) => u === 'https://example.com/plugins/test/index.json',
      ),
    ).toBe(true);
    expect(
      fetchedUrls.some(
        (u) => u === 'https://example.com/plugins/test/scenario-1.json',
      ),
    ).toBe(true);
  });

  it('returns objects produced by instantiateScenario over the supplied gameAssets', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/pluginsIndex.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(pluginRegistry),
        });
      }
      if (url.endsWith('index.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(pluginManifest),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(scenarioJson),
      });
    });

    const gameAssets: GameAssets = {
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
    };

    const result = await loadScenarioFromPlugin(
      'test-plugin',
      'scenario-1.json',
      gameAssets,
    );

    // Empty `packs` in the scenario means instantiateScenario produces no
    // objects — the contract here is that it ran and returned a Map. The
    // important behavior is verified in the previous test: no pack fetches.
    expect(result.objects).toBeInstanceOf(Map);
    // gameAssets reference is preserved.
    expect(result.content).toBe(gameAssets);
  });
});

// ============================================================================
// loadLocalPluginScenario Tests
// ============================================================================

/**
 * Build a fake `File` from a string. jsdom's `File` constructor works, but we
 * need `text()` to return the original content reliably across Node versions.
 */
function fakeFile(name: string, contents: string): File {
  const file = new File([contents], name, { type: 'application/json' });
  // jsdom's File.text() may not roundtrip our exact string in some versions;
  // override to be safe.
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(contents),
  });
  return file;
}

/**
 * Mount the directory-picker mock that `loadLocalPluginDirectory` drives via
 * `document.createElement('input')`. Returns the captured input so the test
 * can fire `onchange` after the function call.
 */
function mockDirectoryPicker(files: File[]): {
  input: {
    type: string;
    webkitdirectory: boolean;
    multiple: boolean;
    click: () => void;
    files: FileList | null;
    onchange: (() => void) | null;
    oncancel: (() => void) | null;
  };
  trigger: () => void;
} {
  const input: ReturnType<typeof mockDirectoryPicker>['input'] = {
    type: '',
    webkitdirectory: false,
    multiple: false,
    click: vi.fn(),
    files: null,
    onchange: null,
    oncancel: null,
  };

  vi.spyOn(document, 'createElement').mockReturnValue(
    input as unknown as HTMLInputElement,
  );

  const fileList = Object.assign([...files], {
    item: (i: number) => files[i] ?? null,
  }) as unknown as FileList;
  Object.defineProperty(fileList, 'length', { value: files.length });

  return {
    input,
    trigger: () => {
      input.files = fileList;
      input.onchange?.();
    },
  };
}

describe('loadLocalPluginScenario', () => {
  beforeEach(() => {
    // Stub URL.createObjectURL — jsdom doesn't implement it.
    let counter = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:mock-${++counter}`),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads a valid local plugin directory and returns instantiated content', async () => {
    const manifest = {
      id: 'local-plugin',
      name: 'Local Test Plugin',
      version: '1.0.0',
      assets: ['core.json'],
      scenarios: ['scenario-1.json'],
    };

    const assetPack = {
      schema: 'ct-assets@1',
      id: 'local-core',
      name: 'Local Core Pack',
      version: '1.0.0',
      baseUrl: '/api/card-image/local/',
      cardTypes: {
        player: { back: 'back.png', size: 'standard' },
      },
      cards: {
        '01001': { type: 'player', face: '01001.jpg' },
      },
      tokenTypes: {
        damage: { name: 'Damage', image: 'tokens/damage.png' },
      },
    };

    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'scenario-1',
      name: 'Local Test Scenario',
      version: '1.0.0',
      packs: [],
    };

    const damagePng = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
      'damage.png',
    );

    const files = [
      fakeFile('index.json', JSON.stringify(manifest)),
      fakeFile('core.json', JSON.stringify(assetPack)),
      fakeFile('scenario-1.json', JSON.stringify(scenario)),
      damagePng,
    ];

    const { trigger } = mockDirectoryPicker(files);
    const promise = loadLocalPluginScenario();
    trigger();

    const result = await promise;

    // Loaded scenario reflects parsed JSON.
    expect(result.scenario.name).toBe('Local Test Scenario');
    expect(result.scenario.id).toBe('scenario-1');

    // pluginManifest field surfaces the manifest so the caller (Load Plugin
    // action) can pass `loadables` to `loadScenarioContent`.
    expect(result.pluginManifest.id).toBe('local-plugin');
    expect(result.pluginManifest.assets).toEqual(['core.json']);

    // GameAssets carry the asset pack contents — cards and cardTypes resolved.
    expect(result.content.cards['01001']).toBeDefined();
    expect(result.content.cardTypes['player']).toBeDefined();

    // tokenTypes.damage.image was rewritten to a blob URL by
    // replaceImagePathsWithBlobUrls (suffix-match against the registered
    // 'damage.png' file).
    expect(result.content.tokenTypes['damage']?.image).toMatch(/^blob:mock-/);

    // blobUrls map is exposed so the caller can pass it into
    // loadScenarioContent → loadablesRegistry (image + parser-module
    // resolution for the active plugin's loadables[]).
    expect(result.blobUrls).toBeInstanceOf(Map);
  });

  it('parses a manifest with no asset packs as long as the scenario file exists', async () => {
    // Edge case: a "scenario-only" local plugin. `loadLocalPluginScenario`
    // iterates assets to load packs, then loads the scenario from the manifest
    // and runs `instantiateScenario`. Even with zero packs the scenario should
    // still parse cleanly.
    const manifest = {
      id: 'no-packs-plugin',
      name: 'Empty Plugin',
      version: '0.1.0',
      assets: [],
      scenarios: ['scenario.json'],
    };
    const scenario: Scenario = {
      schema: 'ct-scenario@2',
      id: 'empty-scenario',
      name: 'Empty Scenario',
      version: '1.0.0',
      packs: [],
    };
    const files = [
      fakeFile('index.json', JSON.stringify(manifest)),
      fakeFile('scenario.json', JSON.stringify(scenario)),
    ];

    const { trigger } = mockDirectoryPicker(files);
    const promise = loadLocalPluginScenario();
    trigger();

    const result = await promise;
    expect(result.scenario.name).toBe('Empty Scenario');
    expect(result.objects.size).toBe(0);
  });
});
