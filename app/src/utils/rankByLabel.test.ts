import { describe, it, expect } from 'vitest';
import { rankByLabel } from './rankByLabel';

interface Item {
  label: string;
  description: string;
}

const rankLabels = (items: Item[], query: string) =>
  rankByLabel(
    items,
    query,
    (i) => i.label,
    (i) => i.description,
  ).map((i) => i.label);

describe('rankByLabel', () => {
  it('puts the exact label match first even when it comes last', () => {
    const items: Item[] = [
      { label: 'Draw to Hand', description: 'Peek at the top card, then draw' },
      { label: 'Flip Selected Objects', description: 'Peek under the card' },
      { label: 'Peek', description: 'Look at the top cards of a stack' },
    ];
    expect(rankLabels(items, 'peek')[0]).toBe('Peek');
  });

  it('ranks exact > prefix > substring > fuzzy label > description', () => {
    const items: Item[] = [
      { label: 'Zzz', description: 'flip' },
      { label: 'Fxlxixp', description: '' },
      { label: 'Unflip', description: '' },
      { label: 'Flip Selected', description: '' },
      { label: 'Flip', description: '' },
    ];
    expect(rankLabels(items, 'flip')).toEqual([
      'Flip',
      'Flip Selected',
      'Unflip',
      'Fxlxixp',
      'Zzz',
    ]);
  });

  it('keeps input order for ties and drops non-matches', () => {
    const items: Item[] = [
      { label: 'Draw B', description: '' },
      { label: 'Other', description: '' },
      { label: 'Draw A', description: '' },
    ];
    expect(rankLabels(items, 'draw')).toEqual(['Draw B', 'Draw A']);
  });
});
