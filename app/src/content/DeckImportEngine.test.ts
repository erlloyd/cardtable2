import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importFromApi } from './DeckImportEngine';
import type { GameAssets, PluginApiImport } from '@cardtable2/shared';

const mockGameAssets: GameAssets = {
  packs: [],
  cardTypes: {},
  cards: {
    '01001': { type: 'hero', face: '01001.jpg' },
    '01002': { type: 'hero', face: '01002.jpg' },
  },
  cardSets: {},
  tokens: {},
  counters: {},
  mats: {},
  tokenTypes: {},
  statusTypes: {},
  modifierStats: {},
  iconTypes: {},
};

const mockApiImport: PluginApiImport = {
  apiEndpoints: {
    public: 'https://example.com/api/decklist/{deckId}',
    private: 'https://example.com/api/deck/{deckId}',
  },
  parserModule: 'deckImport.js',
  labels: {
    siteName: 'TestDB',
    inputPlaceholder: 'Enter deck ID',
  },
};

describe('importFromApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should build correct public API URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network error'));

    await importFromApi({
      deckId: '12345',
      isPrivate: false,
      apiImport: mockApiImport,

      gameAssets: mockGameAssets,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/api/decklist/12345',
    );
  });

  it('should build correct private API URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network error'));

    await importFromApi({
      deckId: '12345',
      isPrivate: true,
      apiImport: mockApiImport,

      gameAssets: mockGameAssets,
    });

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/api/deck/12345');
  });

  it('should fall back to public URL when private not available', async () => {
    const apiImportNoPrivate: PluginApiImport = {
      ...mockApiImport,
      apiEndpoints: {
        public: 'https://example.com/api/decklist/{deckId}',
      },
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network error'));

    await importFromApi({
      deckId: '12345',
      isPrivate: true,
      apiImport: apiImportNoPrivate,

      gameAssets: mockGameAssets,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/api/decklist/12345',
    );
  });

  it('should return error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Failed to fetch'),
    );

    const result = await importFromApi({
      deckId: '12345',
      isPrivate: false,
      apiImport: mockApiImport,

      gameAssets: mockGameAssets,
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Failed to fetch');
    }
  });

  it('should return error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    const result = await importFromApi({
      deckId: '99999',
      isPrivate: false,
      apiImport: mockApiImport,

      gameAssets: mockGameAssets,
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('404');
    }
  });

  it('should return error on invalid JSON response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const result = await importFromApi({
      deckId: '12345',
      isPrivate: false,
      apiImport: mockApiImport,

      gameAssets: mockGameAssets,
    });

    expect('error' in result).toBe(true);
  });
});
