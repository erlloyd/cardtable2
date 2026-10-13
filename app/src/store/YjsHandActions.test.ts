import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YjsStore, toTableObject } from './YjsStore';
import { createDiscardZoneForStack, createObject } from './YjsActions';
import {
  discardCardFromHand,
  moveCardToHand,
  moveCardToBoard,
  reorderCardInHand,
} from './YjsHandActions';
import {
  ObjectKind,
  toCardEntries,
  type StackObject,
} from '@cardtable2/shared';

describe('YjsHandActions', () => {
  let store: YjsStore;

  beforeEach(() => {
    store = new YjsStore('test-table');
  });

  describe('moveCardToHand', () => {
    it('moves top card from stack to hand', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: toCardEntries(['card-1', 'card-2', 'card-3']),
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 0, handId);

      expect(result).toEqual({ code: 'card-1' });
      expect(store.getHandCards(handId)).toEqual(toCardEntries(['card-1']));

      // Stack should still exist with remaining cards
      const yMap = store.getObjectYMap(stackId);
      expect(yMap).toBeDefined();
      expect(yMap!.get('_cards')).toEqual(toCardEntries(['card-2', 'card-3']));
    });

    it('deletes stack when last card is moved to hand', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: toCardEntries(['card-1']),
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 0, handId);

      expect(result).toEqual({ code: 'card-1' });
      expect(store.getHandCards(handId)).toEqual(toCardEntries(['card-1']));

      // Stack should be deleted
      expect(store.getObjectYMap(stackId)).toBeUndefined();
    });

    it('moves card at specific index from stack', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: toCardEntries(['card-1', 'card-2', 'card-3']),
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 1, handId);

      expect(result).toEqual({ code: 'card-2' });
      expect(store.getHandCards(handId)).toEqual(toCardEntries(['card-2']));
      expect(store.getObjectYMap(stackId)!.get('_cards')).toEqual(
        toCardEntries(['card-1', 'card-3']),
      );
    });

    it('inserts card at specific hand index', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'existing-card' });

      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: toCardEntries(['new-card']),
        faceUp: true,
      });

      moveCardToHand(store, stackId, 0, handId, 0);

      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['new-card', 'existing-card']),
      );
    });

    it('returns null for non-existent stack', () => {
      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, 'non-existent', 0, handId);
      expect(result).toBeNull();
    });

    it('returns null for non-existent hand', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: toCardEntries(['card-1']),
        faceUp: true,
      });

      const result = moveCardToHand(store, stackId, 0, 'non-existent');
      expect(result).toBeNull();
    });

    it('returns null for out-of-range card index', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: toCardEntries(['card-1']),
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 5, handId);
      expect(result).toBeNull();
    });
  });

  describe('moveCardToBoard', () => {
    it('creates a new stack from hand card', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-1' });
      store.addCardToHand(handId, { code: 'card-2' });

      const stackId = moveCardToBoard(
        store,
        handId,
        0,
        {
          x: 100,
          y: 200,
          r: 0,
        },
        true,
      );

      expect(stackId).toBeDefined();
      expect(stackId).not.toBeNull();

      // Card should be removed from hand
      expect(store.getHandCards(handId)).toEqual(toCardEntries(['card-2']));

      // New stack should exist on board
      const obj = toTableObject(store.getObjectYMap(stackId!)!) as StackObject;
      expect(obj._kind).toBe(ObjectKind.Stack);
      expect(obj._pos).toEqual({ x: 100, y: 200, r: 0 });
      expect(obj._cards).toEqual(toCardEntries(['card-1']));
      expect(obj._faceUp).toBe(true);
    });

    it('creates face-down stack when specified', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-1' });

      const stackId = moveCardToBoard(
        store,
        handId,
        0,
        {
          x: 0,
          y: 0,
          r: 0,
        },
        false,
      );

      const obj = toTableObject(store.getObjectYMap(stackId!)!) as StackObject;
      expect(obj._faceUp).toBe(false);
    });

    it('returns null for non-existent hand', () => {
      const result = moveCardToBoard(
        store,
        'non-existent',
        0,
        {
          x: 0,
          y: 0,
          r: 0,
        },
        true,
      );
      expect(result).toBeNull();
    });

    it('returns null for out-of-range card index', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-1' });

      const result = moveCardToBoard(
        store,
        handId,
        5,
        {
          x: 0,
          y: 0,
          r: 0,
        },
        true,
      );
      expect(result).toBeNull();
    });
  });

  describe('discardCardFromHand', () => {
    function objectIds(): string[] {
      const ids: string[] = [];
      store.forEachObject((_, id) => ids.push(id));
      return ids;
    }

    function taggedHandCard(): { zoneId: string; handId: string } {
      const source = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 10, y: 20, r: 0 },
        cards: toCardEntries(['deck-card']),
        faceUp: false,
      });
      const zoneId = createDiscardZoneForStack(store, source)!;
      const handId = store.createHand('Test Hand');
      moveCardToHand(store, source, 0, handId);
      return { zoneId, handId };
    }

    it('adds to an existing pile face-up and leaves no extra stack', () => {
      const { zoneId, handId } = taggedHandCard();
      const pile = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: toCardEntries(['old']),
        faceUp: false,
      });
      store.getObjectYMap(pile)!.set('_containerId', zoneId);
      store.addCardToHand(handId, { code: 'other' });
      const before = objectIds().length;

      expect(discardCardFromHand(store, handId, 0)).toBe('routed');

      expect(store.getHandCards(handId)).toEqual(toCardEntries(['other']));
      const cards = store.getObjectYMap(pile)!.get('_cards')!;
      expect(cards[0].code).toBe('deck-card');
      expect(store.getObjectYMap(pile)!.get('_faceUp')).toBe(true);
      expect(objectIds().length).toBe(before);
    });

    it('creates one face-up stack at the zone when there is no pile', () => {
      const { zoneId, handId } = taggedHandCard();
      const before = objectIds().length;

      expect(discardCardFromHand(store, handId, 0)).toBe('routed');

      expect(store.getHandCards(handId)).toEqual([]);
      const added = objectIds().filter(
        (id) => store.getObjectYMap(id)!.get('_containerId') === zoneId,
      );
      expect(added).toHaveLength(1);
      expect(objectIds().length).toBe(before + 1);
      const ymap = store.getObjectYMap(added[0])!;
      expect(ymap.get('_faceUp')).toBe(true);
      expect(ymap.get('_pos')).toEqual(
        store.getObjectYMap(zoneId)!.get('_pos'),
      );
    });

    it('returns no-home and changes nothing without a homeZone', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'plain' });
      const before = objectIds().length;

      expect(discardCardFromHand(store, handId, 0)).toBe('no-home');

      expect(store.getHandCards(handId)).toEqual(toCardEntries(['plain']));
      expect(objectIds().length).toBe(before);
    });

    it('returns no-home when the home zone was deleted', () => {
      const { zoneId, handId } = taggedHandCard();
      store.deleteObject(zoneId);
      const before = objectIds().length;

      expect(discardCardFromHand(store, handId, 0)).toBe('no-home');

      expect(store.getHandCards(handId)).toHaveLength(1);
      expect(objectIds().length).toBe(before);
    });

    it('returns invalid for a bad index or a missing hand', () => {
      const { handId } = taggedHandCard();
      const before = objectIds().length;

      expect(discardCardFromHand(store, handId, 5)).toBe('invalid');
      expect(discardCardFromHand(store, handId, -1)).toBe('invalid');
      expect(discardCardFromHand(store, 'nope', 0)).toBe('invalid');

      expect(store.getHandCards(handId)).toHaveLength(1);
      expect(objectIds().length).toBe(before);
    });
  });

  describe('reorderCardInHand', () => {
    it('moves a card forward in the hand', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-a' });
      store.addCardToHand(handId, { code: 'card-b' });
      store.addCardToHand(handId, { code: 'card-c' });
      store.addCardToHand(handId, { code: 'card-d' });

      reorderCardInHand(store, handId, 0, 2);

      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['card-b', 'card-c', 'card-a', 'card-d']),
      );
    });

    it('moves a card backward in the hand', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-a' });
      store.addCardToHand(handId, { code: 'card-b' });
      store.addCardToHand(handId, { code: 'card-c' });
      store.addCardToHand(handId, { code: 'card-d' });

      reorderCardInHand(store, handId, 3, 1);

      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['card-a', 'card-d', 'card-b', 'card-c']),
      );
    });

    it('is a no-op when fromIndex equals toIndex', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-a' });
      store.addCardToHand(handId, { code: 'card-b' });

      reorderCardInHand(store, handId, 1, 1);

      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['card-a', 'card-b']),
      );
    });

    it('clamps toIndex to valid range', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-a' });
      store.addCardToHand(handId, { code: 'card-b' });
      store.addCardToHand(handId, { code: 'card-c' });

      reorderCardInHand(store, handId, 0, 100);

      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['card-b', 'card-c', 'card-a']),
      );
    });

    it('does nothing for non-existent hand', () => {
      reorderCardInHand(store, 'non-existent', 0, 1);
    });

    it('does nothing for out-of-range fromIndex', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, { code: 'card-a' });
      store.addCardToHand(handId, { code: 'card-b' });

      reorderCardInHand(store, handId, 5, 0);

      expect(store.getHandCards(handId)).toEqual(
        toCardEntries(['card-a', 'card-b']),
      );
    });
  });
});

describe('YjsStore hand methods', () => {
  let store: YjsStore;

  beforeEach(() => {
    store = new YjsStore('test-table');
  });

  it('creates and retrieves a hand', () => {
    const handId = store.createHand('Hero 1');

    expect(handId).toBeDefined();
    expect(store.getHandName(handId)).toBe('Hero 1');
    expect(store.getHandCards(handId)).toEqual([]);
    expect(store.getHandIds()).toContain(handId);
  });

  it('deletes a hand', () => {
    const handId = store.createHand('Hero 1');
    store.deleteHand(handId);

    expect(store.getHandIds()).not.toContain(handId);
    expect(store.getHandName(handId)).toBe('');
  });

  it('renames a hand', () => {
    const handId = store.createHand('Hero 1');
    store.renameHand(handId, 'Hero 2');

    expect(store.getHandName(handId)).toBe('Hero 2');
  });

  it('adds cards to a hand', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, { code: 'card-a' });
    store.addCardToHand(handId, { code: 'card-b' });

    expect(store.getHandCards(handId)).toEqual(
      toCardEntries(['card-a', 'card-b']),
    );
  });

  it('inserts card at specific index', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, { code: 'card-a' });
    store.addCardToHand(handId, { code: 'card-b' });
    store.addCardToHand(handId, { code: 'card-c' }, 1);

    expect(store.getHandCards(handId)).toEqual(
      toCardEntries(['card-a', 'card-c', 'card-b']),
    );
  });

  it('removes card from hand by index', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, { code: 'card-a' });
    store.addCardToHand(handId, { code: 'card-b' });
    store.addCardToHand(handId, { code: 'card-c' });

    const removed = store.removeCardFromHand(handId, 1);

    expect(removed).toEqual({ code: 'card-b' });
    expect(store.getHandCards(handId)).toEqual(
      toCardEntries(['card-a', 'card-c']),
    );
  });

  it('returns null when removing from invalid index', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, { code: 'card-a' });

    expect(store.removeCardFromHand(handId, 5)).toBeNull();
    expect(store.removeCardFromHand(handId, -1)).toBeNull();
  });

  it('getHandCards returns a stable reference until the hand changes', () => {
    const handId = store.createHand('Test');
    expect(store.getHandCards(handId)).toBe(store.getHandCards(handId));
    expect(store.getHandCards('missing')).toBe(store.getHandCards('missing'));

    store.addCardToHand(handId, { code: 'card-1' });
    const before = store.getHandCards(handId);
    expect(store.getHandCards(handId)).toBe(before);

    store.addCardToHand(handId, { code: 'card-2' });
    expect(store.getHandCards(handId)).not.toBe(before);
  });

  it('fires onHandsChange when hands are modified', () => {
    const callback = vi.fn();
    const unsubscribe = store.onHandsChange(callback);

    const handId = store.createHand('Test');
    expect(callback).toHaveBeenCalled();

    callback.mockClear();
    store.addCardToHand(handId, { code: 'card-1' });
    expect(callback).toHaveBeenCalled();

    callback.mockClear();
    store.deleteHand(handId);
    expect(callback).toHaveBeenCalled();

    unsubscribe();
  });
});
