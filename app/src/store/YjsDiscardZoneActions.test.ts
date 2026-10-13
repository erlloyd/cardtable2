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

  it('leaves the pile with no attachments when the discarded card had tokens', () => {
    const pile = makeStack(['A'], zoneId);
    const selected = makeStack(['B']);
    store
      .getObjectYMap(selected)!
      .set('_meta', { attachments: { tokens: { damage: 2 } } });

    expect(discardCardToZone(store, selected)).toBe('routed');

    expect(cardsOf(pile)).toEqual(['B', 'A']);
    expect(
      store.getObjectYMap(pile)!.get('_meta')?.attachments,
    ).toBeUndefined();
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

describe('discardCardToZone strips attachments', () => {
  let store: YjsStore;
  let zoneId: string;

  const seeded = {
    tokens: { damage: 3 },
    status: { stunned: 1 },
    modifiers: { ATK: 1 },
  };

  function makeStack(cards: string[], homeZone?: string): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: cards.map((code) => ({ code, homeZone })),
      faceUp: false,
    });
  }

  function seedMeta(id: string): void {
    store.getObjectYMap(id)!.set('_meta', { attachments: seeded, custom: 'x' });
  }

  function metaOf(id: string): Record<string, unknown> | undefined {
    return store.getObjectYMap(id)!.get('_meta');
  }

  beforeEach(() => {
    store = new YjsStore('test-discard-strip');
    const temp = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: toCardEntries(['A', 'B', 'C']),
      faceUp: false,
    });
    zoneId = createDiscardZoneForStack(store, temp)!;
    store.deleteObject(temp);
  });

  it('path 1: single card into an empty zone arrives clean and keeps other meta', () => {
    const source = makeStack(['A'], zoneId);
    seedMeta(source);

    expect(discardCardToZone(store, source)).toBe('routed');

    const yMap = store.getObjectYMap(source)!;
    expect(yMap.get('_containerId')).toBe(zoneId);
    expect(metaOf(source)?.attachments).toBeUndefined();
    expect(metaOf(source)?.custom).toBe('x');
  });

  it('path 2: single card onto an existing clean pile leaves the pile clean', () => {
    const pile = makeStack(['B'], zoneId);
    store.getObjectYMap(pile)!.set('_containerId', zoneId);
    const source = makeStack(['A'], zoneId);
    seedMeta(source);

    expect(discardCardToZone(store, source)).toBe('routed');

    expect(store.getObjectYMap(source)).toBeUndefined();
    expect(
      store
        .getObjectYMap(pile)!
        .get('_cards')!
        .map((e) => e.code),
    ).toEqual(['A', 'B']);
    expect(metaOf(pile)?.attachments).toBeUndefined();
  });

  it('path 3: top of a multi-card stack arrives clean, remainder keeps attachments', () => {
    const source = makeStack(['A', 'B'], zoneId);
    seedMeta(source);

    expect(discardCardToZone(store, source)).toBe('routed');

    let pileId: string | null = null;
    store.forEachObject((yMap, id) => {
      if (yMap.get('_containerId') === zoneId) pileId = id;
    });
    expect(pileId).not.toBeNull();
    expect(metaOf(pileId!)?.attachments).toBeUndefined();
    expect(metaOf(source)?.attachments).toEqual(seeded);
  });

  it('runs as a single Yjs transaction', () => {
    const source = makeStack(['A'], zoneId);
    seedMeta(source);
    let updates = 0;
    store.getDoc().on('update', () => {
      updates += 1;
    });

    discardCardToZone(store, source);

    expect(updates).toBe(1);
  });

  it('leaves attachments untouched when the card has no home zone', () => {
    const source = makeStack(['A']);
    seedMeta(source);

    expect(discardCardToZone(store, source)).toBe('no-home');

    expect(metaOf(source)?.attachments).toEqual(seeded);
  });
});
