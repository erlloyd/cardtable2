import { describe, it, expect, beforeEach } from 'vitest';
import { YjsStore } from './YjsStore';
import { createObject } from './YjsActions';
import { drawCardsToHand, drawCardsToTable } from './YjsDrawActions';
import { CARD_WIDTH, CARD_HEIGHT } from '../renderer/constants';
import {
  ObjectKind,
  toCardEntries,
  type CardEntry,
  type Position,
} from '@cardtable2/shared';

const CODES = ['c1', 'c2', 'c3', 'c4', 'c5'];

describe('YjsDrawActions', () => {
  let store: YjsStore;

  function makeStack(
    cards: CardEntry[] = toCardEntries(CODES),
    opts: { faceUp?: boolean; pos?: Position } = {},
  ): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: opts.pos ?? { x: 100, y: 200, r: 0 },
      cards,
      faceUp: opts.faceUp ?? true,
    });
  }

  function stackCards(id: string): CardEntry[] | undefined {
    return store.getObjectYMap(id)?.get('_cards');
  }

  function countUpdates(fn: () => void): number {
    let n = 0;
    const handler = () => {
      n++;
    };
    store.getDoc().on('update', handler);
    fn();
    store.getDoc().off('update', handler);
    return n;
  }

  beforeEach(() => {
    store = new YjsStore('test-table');
  });

  describe('drawCardsToHand', () => {
    it('count 1 moves only the top card', () => {
      const stackId = makeStack();
      const handId = store.createHand('Hand');

      const moved = drawCardsToHand(store, stackId, 1, handId);

      expect(moved).toEqual(toCardEntries(['c1']));
      expect(store.getHandCards(handId)).toEqual(toCardEntries(['c1']));
      expect(stackCards(stackId)).toEqual(
        toCardEntries(['c2', 'c3', 'c4', 'c5']),
      );
    });

    it('count 3 of 5 moves the top three in top-first order', () => {
      const stackId = makeStack();
      const handId = store.createHand('Hand');

      const moved = drawCardsToHand(store, stackId, 3, handId);

      expect(moved).toEqual(toCardEntries(['c1', 'c2', 'c3']));
      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['c1', 'c2', 'c3']),
      );
      expect(stackCards(stackId)).toEqual(toCardEntries(['c4', 'c5']));
    });

    it('appends after existing hand cards', () => {
      const stackId = makeStack();
      const handId = store.createHand('Hand');
      drawCardsToHand(store, stackId, 1, handId);

      drawCardsToHand(store, stackId, 2, handId);

      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['c1', 'c2', 'c3']),
      );
    });

    it('count 9 of 3 moves 3 and deletes the stack', () => {
      const stackId = makeStack(toCardEntries(['c1', 'c2', 'c3']));
      const handId = store.createHand('Hand');

      const moved = drawCardsToHand(store, stackId, 9, handId);

      expect(moved).toEqual(toCardEntries(['c1', 'c2', 'c3']));
      expect(store.getObjectYMap(stackId)).toBeUndefined();
    });

    it('count equal to the size deletes the stack', () => {
      const stackId = makeStack();
      const handId = store.createHand('Hand');

      drawCardsToHand(store, stackId, 5, handId);

      expect(store.getObjectYMap(stackId)).toBeUndefined();
      expect(store.getHandCards(handId)).toHaveLength(5);
    });

    it('produces exactly one Yjs update', () => {
      const stackId = makeStack();
      const handId = store.createHand('Hand');

      expect(
        countUpdates(() => drawCardsToHand(store, stackId, 3, handId)),
      ).toBe(1);
    });

    it('emptying the stack is still one Yjs update', () => {
      const stackId = makeStack();
      const handId = store.createHand('Hand');

      expect(
        countUpdates(() => drawCardsToHand(store, stackId, 5, handId)),
      ).toBe(1);
    });

    it('keeps homeZone on tagged entries and adds none to untagged', () => {
      const stackId = makeStack([
        { code: 'c1', homeZone: 'zone-a' },
        { code: 'c2' },
      ]);
      const handId = store.createHand('Hand');

      const moved = drawCardsToHand(store, stackId, 2, handId);

      expect(moved[0]).toEqual({ code: 'c1', homeZone: 'zone-a' });
      expect(Object.hasOwn(moved[1], 'homeZone')).toBe(false);
      const handCards = store.getHandCards(handId);
      expect(handCards[0].homeZone).toBe('zone-a');
      expect(Object.hasOwn(handCards[1], 'homeZone')).toBe(false);
    });

    it('returns [] and changes nothing on failure', () => {
      const stackId = makeStack();
      const handId = store.createHand('Hand');
      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        cards: [],
        faceUp: true,
      });

      expect(drawCardsToHand(store, 'missing', 1, handId)).toEqual([]);
      expect(drawCardsToHand(store, tokenId, 1, handId)).toEqual([]);
      expect(drawCardsToHand(store, stackId, 1, 'no-hand')).toEqual([]);
      expect(drawCardsToHand(store, stackId, 0, handId)).toEqual([]);
      expect(drawCardsToHand(store, stackId, -2, handId)).toEqual([]);

      expect(stackCards(stackId)).toEqual(toCardEntries(CODES));
      expect(store.getHandCards(handId)).toEqual([]);
    });
  });

  describe('drawCardsToTable', () => {
    it('count 1 moves only the top card', () => {
      const stackId = makeStack();

      const ids = drawCardsToTable(store, stackId, 1);

      expect(ids).toHaveLength(1);
      expect(stackCards(ids[0])).toEqual(toCardEntries(['c1']));
      expect(stackCards(stackId)).toEqual(
        toCardEntries(['c2', 'c3', 'c4', 'c5']),
      );
    });

    it('count 3 of 5 makes three stacks in top-first order', () => {
      const stackId = makeStack();

      const ids = drawCardsToTable(store, stackId, 3);

      expect(ids.map((id) => stackCards(id))).toEqual([
        toCardEntries(['c1']),
        toCardEntries(['c2']),
        toCardEntries(['c3']),
      ]);
      expect(stackCards(stackId)).toEqual(toCardEntries(['c4', 'c5']));
    });

    it('count 9 of 3 draws 3 and deletes the stack', () => {
      const stackId = makeStack(toCardEntries(['c1', 'c2', 'c3']));

      const ids = drawCardsToTable(store, stackId, 9);

      expect(ids).toHaveLength(3);
      expect(store.getObjectYMap(stackId)).toBeUndefined();
    });

    it('count equal to the size deletes the stack', () => {
      const stackId = makeStack();

      const ids = drawCardsToTable(store, stackId, 5);

      expect(ids).toHaveLength(5);
      expect(store.getObjectYMap(stackId)).toBeUndefined();
    });

    it('produces exactly one Yjs update', () => {
      const stackId = makeStack();

      expect(countUpdates(() => drawCardsToTable(store, stackId, 3))).toBe(1);
    });

    it('emptying the stack is still one Yjs update', () => {
      const stackId = makeStack();

      expect(countUpdates(() => drawCardsToTable(store, stackId, 5))).toBe(1);
    });

    it('places card i at the row position below the source', () => {
      const stackId = makeStack(toCardEntries(CODES), {
        pos: { x: 100, y: 200, r: 0 },
      });

      const ids = drawCardsToTable(store, stackId, 3);

      ids.forEach((id, i) => {
        const pos = store.getObjectYMap(id)?.get('_pos') as Position;
        expect(pos.x).toBe(100 + i * (CARD_WIDTH + 8));
        expect(pos.y).toBe(200 + CARD_HEIGHT + 8);
      });
    });

    it('positions are computed from the source even when it is emptied', () => {
      const stackId = makeStack(toCardEntries(['c1', 'c2']));

      const ids = drawCardsToTable(store, stackId, 2);

      const pos = store.getObjectYMap(ids[1])?.get('_pos') as Position;
      expect(pos.x).toBe(100 + (CARD_WIDTH + 8));
    });

    it('face-down source gives face-down cards', () => {
      const stackId = makeStack(toCardEntries(CODES), { faceUp: false });

      const ids = drawCardsToTable(store, stackId, 2);

      ids.forEach((id) =>
        expect(store.getObjectYMap(id)?.get('_faceUp')).toBe(false),
      );
    });

    it('face-up source gives face-up cards', () => {
      const stackId = makeStack(toCardEntries(CODES), { faceUp: true });

      const ids = drawCardsToTable(store, stackId, 2);

      ids.forEach((id) =>
        expect(store.getObjectYMap(id)?.get('_faceUp')).toBe(true),
      );
    });

    it('inherits the source rotation', () => {
      const stackId = makeStack(toCardEntries(CODES), {
        pos: { x: 0, y: 0, r: 90 },
      });

      const ids = drawCardsToTable(store, stackId, 3);

      ids.forEach((id) => {
        const pos = store.getObjectYMap(id)?.get('_pos') as Position;
        expect(pos.r).toBe(90);
      });
    });

    it('keeps homeZone on tagged entries and adds none to untagged', () => {
      const stackId = makeStack([
        { code: 'c1', homeZone: 'zone-a' },
        { code: 'c2' },
      ]);

      const ids = drawCardsToTable(store, stackId, 2);

      const first = stackCards(ids[0]);
      const second = stackCards(ids[1]);
      expect(first?.[0]).toEqual({ code: 'c1', homeZone: 'zone-a' });
      expect(Object.hasOwn(second?.[0] ?? {}, 'homeZone')).toBe(false);
    });

    it('returns [] and changes nothing on failure', () => {
      const stackId = makeStack();
      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        cards: [],
        faceUp: true,
      });
      const before = store.getAllObjects().size;

      expect(drawCardsToTable(store, 'missing', 1)).toEqual([]);
      expect(drawCardsToTable(store, tokenId, 1)).toEqual([]);
      expect(drawCardsToTable(store, stackId, 0)).toEqual([]);
      expect(drawCardsToTable(store, stackId, -1)).toEqual([]);

      expect(stackCards(stackId)).toEqual(toCardEntries(CODES));
      expect(store.getAllObjects().size).toBe(before);
    });
  });
});
