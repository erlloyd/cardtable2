import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzySearch } from './fuzzySearch';

describe('fuzzyMatch', () => {
  it('matches empty query to everything', () => {
    expect(fuzzyMatch('anything', '')).toBeGreaterThan(0);
  });

  it('matches exact substring', () => {
    expect(fuzzyMatch('flip cards', 'flip')).toBeGreaterThan(0);
    expect(fuzzyMatch('flip cards', 'cards')).toBeGreaterThan(0);
  });

  it('matches characters in order', () => {
    expect(fuzzyMatch('flip cards', 'fc')).toBeGreaterThan(0);
    expect(fuzzyMatch('rotate objects', 'ro')).toBeGreaterThan(0);
  });

  it('is case insensitive', () => {
    expect(fuzzyMatch('Flip Cards', 'flip')).toBeGreaterThan(0);
    expect(fuzzyMatch('flip cards', 'FLIP')).toBeGreaterThan(0);
  });

  it('returns 0 when characters out of order', () => {
    expect(fuzzyMatch('flip cards', 'cf')).toBe(0);
  });

  it('returns 0 when query character not found', () => {
    expect(fuzzyMatch('flip cards', 'xyz')).toBe(0);
  });

  it('prefers matches at word boundaries', () => {
    const atBoundary = fuzzyMatch('flip cards', 'fc');
    const notAtBoundary = fuzzyMatch('flip cards', 'ip');
    expect(atBoundary).toBeGreaterThan(notAtBoundary);
  });

  it('prefers consecutive matches', () => {
    const consecutive = fuzzyMatch('flip cards', 'flip');
    const scattered = fuzzyMatch('flip cards', 'fpc');
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it('prefers shorter text', () => {
    const short = fuzzyMatch('flip', 'f');
    const long = fuzzyMatch('flip cards forever', 'f');
    expect(short).toBeGreaterThan(long);
  });
});

describe('fuzzySearch', () => {
  interface Item {
    id: string;
    label: string;
  }

  const items: Item[] = [
    { id: '1', label: 'Flip Cards' },
    { id: '2', label: 'Rotate Objects' },
    { id: '3', label: 'Stack Objects' },
    { id: '4', label: 'Clear Selection' },
    { id: '5', label: 'Select All' },
  ];

  it('returns all items when query is empty', () => {
    const results = fuzzySearch(items, '', (item) => item.label);
    expect(results).toHaveLength(5);
  });

  it('filters items by query', () => {
    const results = fuzzySearch(items, 'flip', (item) => item.label);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('1');
  });

  it('matches partial text', () => {
    const results = fuzzySearch(items, 'sel', (item) => item.label);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain('4');
    expect(results.map((r) => r.id)).toContain('5');
  });

  it('sorts by match quality', () => {
    const results = fuzzySearch(items, 's', (item) => item.label);
    // Should match: Stack Objects, Clear Selection, Select All
    expect(results.length).toBeGreaterThan(0);
    // First result should be best match
    const firstLabel = results[0]?.label ?? '';
    expect(firstLabel.toLowerCase().startsWith('s')).toBe(true);
  });

  it('is case insensitive', () => {
    const results = fuzzySearch(items, 'FLIP', (item) => item.label);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('1');
  });

  it('returns empty array when no matches', () => {
    const results = fuzzySearch(items, 'xyz', (item) => item.label);
    expect(results).toHaveLength(0);
  });

  it('handles abbreviations', () => {
    const results = fuzzySearch(items, 'fc', (item) => item.label);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe('1'); // Flip Cards
  });
});
