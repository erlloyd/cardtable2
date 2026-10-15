import { describe, it, expect, beforeEach } from 'vitest';
import { YjsStore } from './YjsStore';
import { createObject } from './YjsActions';
import { commitPeek, type PeekPlacement } from './YjsPeekActions';
import { ObjectKind, toCardEntries, type CardEntry } from '@cardtable2/shared';

describe('YjsPeekActions.commitPeek', () => {
  let store: YjsStore;

  function makeStack(cards: CardEntry[]): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 100, y: 200, r: 0 },
      cards,
      faceUp: false,
    });
  }

  function stackCards(id: string): CardEntry[] | undefined {
    return store.getObjectYMap(id)?.get('_cards');
  }

  function top(entries: CardEntry[]): PeekPlacement[] {
    return entries.map((entry) => ({ entry, dest: 'top' as const }));
  }

  beforeEach(() => {
    store = new YjsStore('test-table');
  });

  it('reorders the top N and keeps the rest', () => {
    const [a, b, c, d, e] = toCardEntries(['A', 'B', 'C', 'D', 'E']);
    const id = makeStack([a, b, c, d, e]);

    const result = commitPeek(store, id, [a, b, c], top([c, a, b]), {});

    expect(result).toBe('applied');
    expect(stackCards(id)).toEqual([c, a, b, d, e]);
  });

  it('keeps homeZone tags through the reorder', () => {
    const a: CardEntry = { code: 'A', homeZone: 'z1' };
    const b: CardEntry = { code: 'B' };
    const c: CardEntry = { code: 'C', homeZone: 'z2' };
    const id = makeStack([a, b, c]);

    commitPeek(store, id, [a, b], top([b, a]), {});

    expect(stackCards(id)).toEqual([
      { code: 'B' },
      { code: 'A', homeZone: 'z1' },
      { code: 'C', homeZone: 'z2' },
    ]);
  });

  it('reorders correctly with duplicate codes', () => {
    const a1: CardEntry = { code: 'A', homeZone: 'z1' };
    const a2: CardEntry = { code: 'A' };
    const b: CardEntry = { code: 'B' };
    const id = makeStack([a1, a2, b, { code: 'A' }]);

    const result = commitPeek(store, id, [a1, a2, b], top([b, a2, a1]), {});

    expect(result).toBe('applied');
    expect(stackCards(id)).toEqual([b, a2, a1, { code: 'A' }]);
  });

  it('returns stale and writes nothing when the live top changed', () => {
    const [a, b, c, d] = toCardEntries(['A', 'B', 'C', 'D']);
    const id = makeStack([a, b, c, d]);
    const live = toCardEntries(['B', 'A', 'C', 'D']);
    store.getObjectYMap(id)?.set('_cards', live);

    const result = commitPeek(store, id, [a, b], top([b, a]), {});

    expect(result).toBe('stale');
    expect(stackCards(id)).toEqual(live);
  });

  it('returns stale when the stack shrank below N', () => {
    const [a, b, c] = toCardEntries(['A', 'B', 'C']);
    const id = makeStack([a, b]);

    const result = commitPeek(store, id, [a, b, c], top([c, b, a]), {});

    expect(result).toBe('stale');
    expect(stackCards(id)).toEqual([a, b]);
  });

  it('returns invalid for a missing stack or a non-stack object', () => {
    const [a] = toCardEntries(['A']);
    expect(commitPeek(store, 'nope', [a], top([a]), {})).toBe('invalid');

    const tokenId = createObject(store, {
      kind: ObjectKind.Token,
      pos: { x: 0, y: 0, r: 0 },
    });
    expect(commitPeek(store, tokenId, [a], top([a]), {})).toBe('invalid');
  });

  it('returns invalid for a non-permutation of the peeked cards', () => {
    const [a, b, c] = toCardEntries(['A', 'B', 'C']);
    const id = makeStack([a, b, c]);

    expect(commitPeek(store, id, [a, b], top([a, c]), {})).toBe('invalid');
    expect(commitPeek(store, id, [a, b], top([a, a]), {})).toBe('invalid');
    expect(commitPeek(store, id, [a, b], top([a]), {})).toBe('invalid');
    expect(stackCards(id)).toEqual([a, b, c]);
  });

  it('returns invalid for a non-top destination', () => {
    const [a, b] = toCardEntries(['A', 'B']);
    const id = makeStack([a, b]);

    const result = commitPeek(
      store,
      id,
      [a, b],
      [
        { entry: b, dest: 'top' },
        { entry: a, dest: 'bottom' },
      ],
      {},
    );

    expect(result).toBe('invalid');
    expect(stackCards(id)).toEqual([a, b]);
  });
});
