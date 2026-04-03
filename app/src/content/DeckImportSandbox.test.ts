import { describe, it, expect, afterEach } from 'vitest';
import { DeckImportSandbox } from './DeckImportSandbox';
import type { GameAssets } from '@cardtable2/shared';

// Mock minimal GameAssets for testing
const mockGameAssets: GameAssets = {
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

describe('DeckImportSandbox', () => {
  let sandbox: DeckImportSandbox;

  afterEach(() => {
    sandbox?.dispose();
  });

  it('should create a sandbox instance', () => {
    sandbox = new DeckImportSandbox();
    expect(sandbox).toBeDefined();
  });

  it('should have a default timeout of 10 seconds', () => {
    sandbox = new DeckImportSandbox();
    expect(sandbox.timeout).toBe(10000);
  });

  it('should allow custom timeout', () => {
    sandbox = new DeckImportSandbox({ timeout: 5000 });
    expect(sandbox.timeout).toBe(5000);
  });

  it('should reject if worker URL is empty', async () => {
    sandbox = new DeckImportSandbox();

    await expect(
      sandbox.parse({
        parserModuleUrl: '',
        apiResponse: {},
        gameAssets: mockGameAssets,
      }),
    ).rejects.toThrow('Parser module URL is required');
  });
});
