import { describe, it, expect, beforeEach } from 'vitest';
import { YjsStore } from './YjsStore';
import { ObjectKind, toCardEntries } from '@cardtable2/shared';
import {
  createDiscardZoneForStack,
  createObject,
  discardCardToZone,
} from './YjsActions';

describe('discardCardToZone with duplicate card ids', () => {
  let store: YjsStore;
  let zoneId: string;

  function makeStack(cards: string[], containerId?: string): string {
    const id = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: cards.map((code) => ({ code, homeZone: zoneId })),
      faceUp: false,
    });
    if (containerId) {
      store.getObjectYMap(id)!.set('_containerId', containerId);
    }
    return id;
  }

  function cardsOf(id: string): string[] {
    return store
      .getObjectYMap(id)!
      .get('_cards')!
      .map((e) => e.code);
  }

  function totalCards(): number {
    let total = 0;
    store.forEachObject((yMap) => {
      if (yMap.get('_kind') === ObjectKind.Stack) {
        total += yMap.get('_cards')!.map((e) => e.code).length;
      }
    });
    return total;
  }

  beforeEach(() => {
    store = new YjsStore('test-discard-dupes');
    const temp = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: toCardEntries(['A', 'B', 'C']),
      faceUp: false,
    });
    zoneId = createDiscardZoneForStack(store, temp)!;
    store.deleteObject(temp);
  });

  it('leaves an older stack holding the same id untouched', () => {
    const older = makeStack(['A', 'B']);
    const selected = makeStack(['A', 'C']);

    expect(discardCardToZone(store, selected)).toBe('routed');

    expect(cardsOf(older)).toEqual(['A', 'B']);
    expect(cardsOf(selected)).toEqual(['C']);
    expect(totalCards()).toBe(4);
  });

  it('moves the selected top onto an older zone pile holding the same id', () => {
    const pile = makeStack(['A', 'B'], zoneId);
    const selected = makeStack(['A', 'C']);

    expect(discardCardToZone(store, selected)).toBe('routed');

    expect(cardsOf(selected)).toEqual(['C']);
    expect(cardsOf(pile)).toEqual(['A', 'A', 'B']);
    expect(totalCards()).toBe(4);
  });

  it('discards one copy at a time from a stack with duplicate ids', () => {
    const selected = makeStack(['A', 'A', 'B']);

    expect(discardCardToZone(store, selected)).toBe('routed');
    expect(cardsOf(selected)).toEqual(['A', 'B']);
    expect(totalCards()).toBe(3);

    expect(discardCardToZone(store, selected)).toBe('routed');
    expect(cardsOf(selected)).toEqual(['B']);
    expect(totalCards()).toBe(3);
  });
});
