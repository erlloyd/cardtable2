import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsStore } from './YjsStore';
import { createDiscardZoneForStack, createObject } from './YjsActions';
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

  describe('destinations', () => {
    function place(
      ...pairs: [CardEntry, PeekPlacement['dest']][]
    ): PeekPlacement[] {
      return pairs.map(([entry, dest]) => ({ entry, dest }));
    }

    function makeZone(): string {
      const temp = makeStack(toCardEntries(['T']));
      const zoneId = createDiscardZoneForStack(store, temp)!;
      store.deleteObject(temp);
      return zoneId;
    }

    function pileCards(zoneId: string): CardEntry[] {
      let cards: CardEntry[] = [];
      store.forEachObject((yMap) => {
        if (yMap.get('_containerId') === zoneId) cards = yMap.get('_cards')!;
      });
      return cards;
    }

    function tableStacks(): {
      cards: CardEntry[];
      faceUp: boolean;
      y: number;
    }[] {
      const out: { cards: CardEntry[]; faceUp: boolean; y: number }[] = [];
      store.forEachObject((yMap) => {
        if (yMap.get('_kind') !== ObjectKind.Stack) return;
        if (yMap.get('_containerId')) return;
        if (yMap.get('_pos')!.y === 200) return;
        out.push({
          cards: yMap.get('_cards')!,
          faceUp: yMap.get('_faceUp') === true,
          y: yMap.get('_pos')!.y,
        });
      });
      return out;
    }

    it('bottom keeps the first-listed card nearest the top of the bottom group', () => {
      const [a, b, c, d] = toCardEntries(['A', 'B', 'C', 'D']);
      const id = makeStack([a, b, c, d]);

      const result = commitPeek(
        store,
        id,
        [a, b, c],
        place([c, 'bottom'], [a, 'bottom'], [b, 'top']),
        {},
      );

      expect(result).toBe('applied');
      expect(stackCards(id)).toEqual([b, d, c, a]);
    });

    it('hand appends in display order', () => {
      const [a, b, c, d] = toCardEntries(['A', 'B', 'C', 'D']);
      const id = makeStack([a, b, c, d]);
      const handId = store.createHand('Hand');
      store.addCardToHand(handId, { code: 'H' });

      const result = commitPeek(
        store,
        id,
        [a, b, c],
        place([c, 'hand'], [a, 'hand'], [b, 'top']),
        { handId },
      );

      expect(result).toBe('applied');
      expect(store.getHandCards(handId)).toEqual([{ code: 'H' }, c, a]);
      expect(stackCards(id)).toEqual([b, d]);
    });

    it('table deals face-up single-card stacks below the stack', () => {
      const [a, b, c] = toCardEntries(['A', 'B', 'C']);
      const id = makeStack([a, b, c]);

      commitPeek(store, id, [a, b], place([b, 'table'], [a, 'table']), {});

      expect(stackCards(id)).toEqual([c]);
      const dealt = tableStacks();
      expect(dealt.map((s) => s.cards)).toEqual([[b], [a]]);
      expect(dealt.every((s) => s.faceUp && s.y > 200)).toBe(true);
    });

    it('discard routes cards to the home zone pile', () => {
      const zoneId = makeZone();
      const a: CardEntry = { code: 'A', homeZone: zoneId };
      const b: CardEntry = { code: 'B', homeZone: zoneId };
      const c: CardEntry = { code: 'C' };
      const id = makeStack([a, b, c]);

      const result = commitPeek(
        store,
        id,
        [a, b],
        place([a, 'discard'], [b, 'discard']),
        {},
      );

      expect(result).toBe('applied');
      expect(stackCards(id)).toEqual([c]);
      expect(
        pileCards(zoneId)
          .map((e) => e.code)
          .sort(),
      ).toEqual(['A', 'B']);
    });

    it('applies a mixed plan across all five destinations', () => {
      const zoneId = makeZone();
      const a: CardEntry = { code: 'A', homeZone: zoneId };
      const b: CardEntry = { code: 'B' };
      const c: CardEntry = { code: 'C' };
      const d: CardEntry = { code: 'D' };
      const e: CardEntry = { code: 'E' };
      const f: CardEntry = { code: 'F' };
      const id = makeStack([a, b, c, d, e, f]);
      const handId = store.createHand('Hand');

      const result = commitPeek(
        store,
        id,
        [a, b, c, d, e],
        place(
          [b, 'hand'],
          [c, 'table'],
          [a, 'discard'],
          [d, 'top'],
          [e, 'bottom'],
        ),
        { handId },
      );

      expect(result).toBe('applied');
      expect(stackCards(id)).toEqual([d, f, e]);
      expect(store.getHandCards(handId)).toEqual([b]);
      expect(tableStacks().map((s) => s.cards)).toEqual([[c]]);
      expect(pileCards(zoneId)).toEqual([a]);
    });

    it('deletes the stack and loses no card when every card leaves', () => {
      const zoneId = makeZone();
      const a: CardEntry = { code: 'A', homeZone: zoneId };
      const b: CardEntry = { code: 'B' };
      const c: CardEntry = { code: 'C' };
      const id = makeStack([a, b, c]);
      const handId = store.createHand('Hand');

      const result = commitPeek(
        store,
        id,
        [a, b, c],
        place([b, 'hand'], [c, 'table'], [a, 'discard']),
        { handId },
      );

      expect(result).toBe('applied');
      // The last card is discarded in place: the emptied stack becomes the pile.
      expect(store.getObjectYMap(id)?.get('_containerId')).toBe(zoneId);
      expect(store.getHandCards(handId)).toEqual([b]);
      expect(tableStacks().map((s) => s.cards)).toEqual([[c]]);
      expect(pileCards(zoneId)).toEqual([a]);
    });

    it('deletes the stack when hand and table take every card', () => {
      const [a, b] = toCardEntries(['A', 'B']);
      const id = makeStack([a, b]);
      const handId = store.createHand('Hand');

      const result = commitPeek(
        store,
        id,
        [a, b],
        place([a, 'hand'], [b, 'table']),
        { handId },
      );

      expect(result).toBe('applied');
      expect(store.getObjectYMap(id)).toBeUndefined();
      expect(store.getHandCards(handId)).toEqual([a]);
      expect(tableStacks().map((s) => s.cards)).toEqual([[b]]);
    });

    it('keeps a discard card with no home on top of the stack', () => {
      const a: CardEntry = { code: 'A' };
      const b: CardEntry = { code: 'B' };
      const c: CardEntry = { code: 'C' };
      const id = makeStack([a, b, c]);

      const result = commitPeek(
        store,
        id,
        [a, b],
        place([a, 'discard'], [b, 'top']),
        {},
      );

      expect(result).toBe('applied');
      expect(stackCards(id)).toEqual([a, b, c]);
    });

    it('returns invalid and writes nothing for hand placements without a hand', () => {
      const [a, b] = toCardEntries(['A', 'B']);
      const id = makeStack([a, b]);

      expect(commitPeek(store, id, [a], place([a, 'hand']), {})).toBe(
        'invalid',
      );
      expect(
        commitPeek(store, id, [a], place([a, 'hand']), { handId: 'nope' }),
      ).toBe('invalid');
      expect(stackCards(id)).toEqual([a, b]);
    });
  });

  describe('shuffle', () => {
    afterEach(() => vi.restoreAllMocks());

    const sorted = (cards: CardEntry[] | undefined) =>
      (cards ?? []).map((c) => c.code).sort();

    function setup() {
      const [a, b, c, d, e, f] = toCardEntries(['A', 'B', 'C', 'D', 'E', 'F']);
      const id = makeStack([a, b, c, d, e, f]);
      const placements: PeekPlacement[] = [
        { entry: a, dest: 'bottom' },
        { entry: b, dest: 'top' },
        { entry: c, dest: 'bottom' },
        { entry: d, dest: 'top' },
        { entry: e, dest: 'top' },
      ];
      return { id, peeked: [a, b, c, d, e], placements, rest: f };
    }

    it('shuffleBottom randomizes only the bottom group', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { id, peeked, placements, rest } = setup();
      const [a, b, c, d, e] = peeked;

      const result = commitPeek(store, id, peeked, placements, {
        shuffleBottom: true,
      });

      expect(result).toBe('applied');
      expect(stackCards(id)).toEqual([b, d, e, rest, c, a]);
    });

    it('shuffleTop randomizes only the top group', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { id, peeked, placements, rest } = setup();
      const [a, b, c, d, e] = peeked;

      commitPeek(store, id, peeked, placements, { shuffleTop: true });

      expect(stackCards(id)).toEqual([d, e, b, rest, a, c]);
    });

    it('without flags keeps window order, and a shuffle is a permutation', () => {
      const { id, peeked, placements, rest } = setup();
      const [a, b, c, d, e] = peeked;

      commitPeek(store, id, peeked, placements, {});
      expect(stackCards(id)).toEqual([b, d, e, rest, a, c]);

      const again = setup();
      commitPeek(store, again.id, again.peeked, again.placements, {
        shuffleTop: true,
        shuffleBottom: true,
      });
      expect(sorted(stackCards(again.id))).toEqual(
        sorted([a, b, c, d, e, rest]),
      );
    });
  });
});
