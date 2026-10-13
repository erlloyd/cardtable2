import { describe, it, expect } from 'vitest';
import type { StatusTypeDef } from '@cardtable2/shared';
import { hasAttachments, mergeAttachments } from './attachmentMerge';

const statusTypes: Record<string, StatusTypeDef> = {
  stunned: { name: 'Stunned', image: 'stunned.png' },
  poison: { name: 'Poison', image: 'poison.png', countable: true },
};

describe('hasAttachments', () => {
  it('is false for undefined, {} and empty maps', () => {
    expect(hasAttachments(undefined)).toBe(false);
    expect(hasAttachments({})).toBe(false);
    expect(hasAttachments({ tokens: {} })).toBe(false);
    expect(hasAttachments({ icons: [] })).toBe(false);
  });

  it('is true when any of the four kinds has an entry', () => {
    expect(hasAttachments({ tokens: { threat: 1 } })).toBe(true);
    expect(hasAttachments({ status: { stunned: 1 } })).toBe(true);
    expect(hasAttachments({ modifiers: { ATK: 1 } })).toBe(true);
    expect(hasAttachments({ icons: ['guard'] })).toBe(true);
  });
});

describe('mergeAttachments', () => {
  it('sums tokens of the same type', () => {
    expect(
      mergeAttachments(
        { tokens: { damage: 2 } },
        { tokens: { damage: 3 } },
        statusTypes,
      ),
    ).toEqual({ tokens: { damage: 5 } });
  });

  it('keeps disjoint token types from both sides', () => {
    expect(
      mergeAttachments(
        { tokens: { damage: 2 } },
        { tokens: { threat: 1 } },
        statusTypes,
      ),
    ).toEqual({ tokens: { damage: 2, threat: 1 } });
  });

  it('sums countable statuses', () => {
    expect(
      mergeAttachments(
        { status: { poison: 1 } },
        { status: { poison: 2 } },
        statusTypes,
      ),
    ).toEqual({ status: { poison: 3 } });
  });

  it('keeps a non-countable status at 1', () => {
    expect(
      mergeAttachments(
        { status: { stunned: 1 } },
        { status: { stunned: 1 } },
        statusTypes,
      ),
    ).toEqual({ status: { stunned: 1 } });
  });

  it('treats an unknown status type as non-countable', () => {
    expect(
      mergeAttachments(
        { status: { mystery: 1 } },
        { status: { mystery: 1 } },
        statusTypes,
      ),
    ).toEqual({ status: { mystery: 1 } });
    expect(
      mergeAttachments(
        { status: { mystery: 1 } },
        { status: { mystery: 1 } },
        undefined,
      ),
    ).toEqual({ status: { mystery: 1 } });
  });

  it('sums modifiers and drops a key that sums to 0', () => {
    expect(
      mergeAttachments(
        { modifiers: { ATK: 1, THW: 2 } },
        { modifiers: { ATK: 2, THW: -2 } },
        statusTypes,
      ),
    ).toEqual({ modifiers: { ATK: 3 } });
    expect(
      mergeAttachments(
        { modifiers: { ATK: 1 } },
        { modifiers: { ATK: -1 } },
        statusTypes,
      ),
    ).toEqual({});
  });

  it('unions icons without duplicates, first-seen order', () => {
    expect(
      mergeAttachments(
        { icons: ['guard', 'retaliate'] },
        { icons: ['retaliate', 'stun'] },
        statusTypes,
      ),
    ).toEqual({ icons: ['guard', 'retaliate', 'stun'] });
  });

  it('returns the other side unchanged when one side is empty', () => {
    const side = {
      tokens: { damage: 2 },
      status: { stunned: 1, poison: 2 },
      modifiers: { ATK: 1 },
      icons: ['guard'],
    };
    expect(mergeAttachments(side, {}, statusTypes)).toEqual(side);
    expect(mergeAttachments({}, side, statusTypes)).toEqual(side);
  });
});
