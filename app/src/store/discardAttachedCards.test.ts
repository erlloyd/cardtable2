import { describe, it, expect, beforeEach } from 'vitest';
import { YjsStore } from './YjsStore';
import {
  DEFAULT_ATTACHMENT_LAYOUT,
  ObjectKind,
  toCardEntries,
  type Position,
} from '@cardtable2/shared';
import {
  attachCards,
  createDiscardZoneForStack,
  createObject,
  discardCardToZone,
} from './YjsActions';
import { computeAttachmentPositions } from './attachmentLayout';

describe('discardCardToZone with attached cards', () => {
  let store: YjsStore;
  let zoneE: string;
  let zoneP: string;

  function makeZone(x: number): string {
    const temp = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x, y: 1000, r: 0 },
      cards: toCardEntries(['temp']),
      faceUp: false,
    });
    const zone = createDiscardZoneForStack(store, temp)!;
    store.deleteObject(temp);
    return zone;
  }

  function makeCard(
    code: string,
    homeZone: string | undefined,
    pos: Position = { x: 0, y: 0, r: 0 },
  ): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos,
      cards: [{ code, homeZone }],
      faceUp: false,
    });
  }

  function makePile(zone: string, code: string): string {
    const pile = makeCard(code, zone, zonePos(zone));
    store.getObjectYMap(pile)!.set('_containerId', zone);
    return pile;
  }

  function zonePos(zone: string): Position {
    return store.getObjectYMap(zone)!.get('_pos') as Position;
  }

  function pos(id: string): Position {
    return store.getObjectYMap(id)!.get('_pos') as Position;
  }

  function topCode(id: string): string {
    return store.getObjectYMap(id)!.get('_cards')![0].code;
  }

  function exists(id: string): boolean {
    return store.getObjectYMap(id) !== undefined;
  }

  function linkedObjects(): string[] {
    const ids: string[] = [];
    store.forEachObject((yMap, id) => {
      const attachedIds = yMap.get('_attachedCardIds') ?? [];
      if (yMap.get('_attachedToId') || attachedIds.length > 0) ids.push(id);
    });
    return ids;
  }

  beforeEach(() => {
    store = new YjsStore('test-discard-attached');
    zoneE = makeZone(0);
    zoneP = makeZone(500);
  });

  it('routes host and attached card to their own existing piles', () => {
    const pileE = makePile(zoneE, 'eTop');
    const pileP = makePile(zoneP, 'pTop');
    const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
    const attached = makeCard('att', zoneP, { x: 100, y: 130, r: 0 });
    attachCards(store, [attached], host);

    expect(discardCardToZone(store, host)).toBe('routed');

    expect(exists(host)).toBe(false);
    expect(exists(attached)).toBe(false);
    expect(topCode(pileE)).toBe('host');
    expect(topCode(pileP)).toBe('att');
    expect(linkedObjects()).toEqual([]);
  });

  it('moves host and attached card into their own empty zones', () => {
    const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
    const attached = makeCard('att', zoneP, { x: 100, y: 130, r: 0 });
    attachCards(store, [attached], host);

    expect(discardCardToZone(store, host)).toBe('routed');

    const hostMap = store.getObjectYMap(host)!;
    expect(pos(host)).toEqual(zonePos(zoneE));
    expect(hostMap.get('_containerId')).toBe(zoneE);
    expect(hostMap.get('_attachedCardIds')).toBeUndefined();
    const attachedMap = store.getObjectYMap(attached)!;
    expect(pos(attached)).toEqual(zonePos(zoneP));
    expect(attachedMap.get('_containerId')).toBe(zoneP);
    expect(attachedMap.get('_attachedToId')).toBeUndefined();
  });

  it('detaches an attached card before discarding it and leaves the host in place', () => {
    const hostPos = { x: 100, y: 100, r: 0 };
    const host = makeCard('host', zoneE, hostPos);
    const a = makeCard('a', zoneP);
    const b = makeCard('b', zoneP);
    attachCards(store, [a, b], host);

    expect(discardCardToZone(store, a)).toBe('routed');

    expect(store.getObjectYMap(host)!.get('_attachedCardIds')).toEqual([b]);
    expect(pos(b)).toEqual(
      computeAttachmentPositions(hostPos, 1, DEFAULT_ATTACHMENT_LAYOUT)[0],
    );
    expect(store.getObjectYMap(a)!.get('_containerId')).toBe(zoneP);
    expect(store.getObjectYMap(a)!.get('_attachedToId')).toBeUndefined();
    expect(pos(host)).toEqual(hostPos);
  });

  it('leaves an attached card with no home zone in place, unlinked', () => {
    const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
    const attached = makeCard('att', undefined);
    attachCards(store, [attached], host);
    const before = pos(attached);

    expect(discardCardToZone(store, host)).toBe('routed');

    expect(exists(host)).toBe(true);
    expect(exists(attached)).toBe(true);
    const attachedMap = store.getObjectYMap(attached)!;
    expect(pos(attached)).toEqual(before);
    expect(attachedMap.get('_attachedToId')).toBeUndefined();
    expect(attachedMap.get('_containerId') ?? null).toBeNull();
    expect(store.getObjectYMap(host)!.get('_attachedCardIds')).toBeUndefined();
  });

  it('applies the whole cascade in one transaction', () => {
    makePile(zoneE, 'eTop');
    makePile(zoneP, 'pTop');
    const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
    const attached = makeCard('att', zoneP, { x: 100, y: 130, r: 0 });
    attachCards(store, [attached], host);

    let updates = 0;
    const onUpdate = () => {
      updates++;
    };
    store.getDoc().on('update', onUpdate);
    discardCardToZone(store, host);
    store.getDoc().off('update', onUpdate);

    expect(updates).toBe(1);
  });

  function totalCards(): number {
    let total = 0;
    store.forEachObject((yMap) => {
      if (yMap.get('_kind') === ObjectKind.Stack) {
        total += (yMap.get('_cards') ?? []).length;
      }
    });
    return total;
  }

  function containerOf(id: string): string | null {
    return store.getObjectYMap(id)!.get('_containerId') ?? null;
  }

  describe('selection holds a host and its own attached card', () => {
    it('host then attached, piles exist: second call is invalid, each card once in its own pile', () => {
      const pileE = makePile(zoneE, 'eTop');
      const pileP = makePile(zoneP, 'pTop');
      const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
      const attached = makeCard('att', zoneP, { x: 100, y: 130, r: 0 });
      attachCards(store, [attached], host);
      const before = totalCards();

      expect(discardCardToZone(store, host)).toBe('routed');
      expect(discardCardToZone(store, attached)).toBe('invalid');

      expect(totalCards()).toBe(before);
      expect(
        store
          .getObjectYMap(pileE)!
          .get('_cards')!
          .map((c) => c.code),
      ).toEqual(['host', 'eTop']);
      expect(
        store
          .getObjectYMap(pileP)!
          .get('_cards')!
          .map((c) => c.code),
      ).toEqual(['att', 'pTop']);
      expect(linkedObjects()).toEqual([]);
    });

    it('host then attached, zones empty: second call routes and changes nothing', () => {
      const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
      const attached = makeCard('att', zoneP, { x: 100, y: 130, r: 0 });
      attachCards(store, [attached], host);
      const before = totalCards();

      expect(discardCardToZone(store, host)).toBe('routed');
      const posAfterFirst = pos(attached);
      const cardsAfterFirst = store.getObjectYMap(attached)!.get('_cards');
      expect(containerOf(attached)).toBe(zoneP);

      expect(discardCardToZone(store, attached)).toBe('routed');

      expect(pos(attached)).toEqual(posAfterFirst);
      expect(containerOf(attached)).toBe(zoneP);
      expect(store.getObjectYMap(attached)!.get('_cards')).toEqual(
        cardsAfterFirst,
      );
      expect(totalCards()).toBe(before);
      expect(linkedObjects()).toEqual([]);
    });

    it('host then attached, attached has no home: second call is no-home, attached stays unlinked', () => {
      const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
      const attached = makeCard('att', undefined);
      attachCards(store, [attached], host);
      const before = totalCards();

      expect(discardCardToZone(store, host)).toBe('routed');
      const posAfterFirst = pos(attached);

      expect(discardCardToZone(store, attached)).toBe('no-home');

      expect(pos(attached)).toEqual(posAfterFirst);
      expect(totalCards()).toBe(before);
      expect(linkedObjects()).toEqual([]);
    });

    it('attached then host: both routed, each card once in its own pile', () => {
      const pileE = makePile(zoneE, 'eTop');
      const pileP = makePile(zoneP, 'pTop');
      const host = makeCard('host', zoneE, { x: 100, y: 100, r: 0 });
      const attached = makeCard('att', zoneP, { x: 100, y: 130, r: 0 });
      attachCards(store, [attached], host);
      const before = totalCards();

      expect(discardCardToZone(store, attached)).toBe('routed');
      expect(discardCardToZone(store, host)).toBe('routed');

      expect(totalCards()).toBe(before);
      expect(
        store
          .getObjectYMap(pileE)!
          .get('_cards')!
          .map((c) => c.code),
      ).toEqual(['host', 'eTop']);
      expect(
        store
          .getObjectYMap(pileP)!
          .get('_cards')!
          .map((c) => c.code),
      ).toEqual(['att', 'pTop']);
      expect(linkedObjects()).toEqual([]);
    });
  });

  describe('chain: an attached card that has its own attached card', () => {
    let h: string;
    let a: string;
    let b: string;
    let pileE: string;
    let pileP: string;

    function codes(id: string): string[] {
      return store
        .getObjectYMap(id)!
        .get('_cards')!
        .map((c) => c.code);
    }

    function buildChain(bHome: string | undefined): void {
      pileE = makePile(zoneE, 'eTop');
      pileP = makePile(zoneP, 'pTop');
      h = makeCard('h', zoneE, { x: 100, y: 100, r: 0 });
      a = makeCard('a', zoneP, { x: 300, y: 300, r: 0 });
      b = makeCard('b', bHome, { x: 500, y: 500, r: 0 });
      attachCards(store, [a], h);
      attachCards(store, [b], a);
      // Precondition: the chain really exists.
      expect(store.getObjectYMap(a)!.get('_attachedToId')).toBe(h);
      expect(store.getObjectYMap(a)!.get('_attachedCardIds')).toEqual([b]);
      expect(store.getObjectYMap(b)!.get('_attachedToId')).toBe(a);
    }

    it('discarding the head sends H, A and B to their own piles in one update', () => {
      buildChain(zoneP);
      const before = totalCards();

      let updates = 0;
      const onUpdate = () => {
        updates++;
      };
      store.getDoc().on('update', onUpdate);
      expect(discardCardToZone(store, h)).toBe('routed');
      store.getDoc().off('update', onUpdate);

      expect(updates).toBe(1);
      expect(exists(h) || exists(a) || exists(b)).toBe(false);
      expect(codes(pileE)).toEqual(['h', 'eTop']);
      expect(codes(pileP)).toHaveLength(3);
      expect(codes(pileP)).toContain('a');
      expect(codes(pileP)).toContain('b');
      expect(totalCards()).toBe(before);
      expect(linkedObjects()).toEqual([]);
    });

    it('discarding the middle card discards A and B and leaves H unlinked', () => {
      buildChain(zoneP);
      const before = totalCards();

      expect(discardCardToZone(store, a)).toBe('routed');

      expect(exists(a) || exists(b)).toBe(false);
      expect(exists(h)).toBe(true);
      expect(store.getObjectYMap(h)!.get('_attachedCardIds') ?? []).toEqual([]);
      expect(codes(pileP)).toHaveLength(3);
      expect(codes(pileP)).toContain('a');
      expect(codes(pileP)).toContain('b');
      expect(totalCards()).toBe(before);
      expect(linkedObjects()).toEqual([]);
    });

    it('discarding the head with a no-home tail leaves B in place, unlinked', () => {
      buildChain(undefined);
      const bPos = pos(b);
      const before = totalCards();

      expect(discardCardToZone(store, h)).toBe('routed');

      expect(exists(h) || exists(a)).toBe(false);
      expect(codes(pileE)).toEqual(['h', 'eTop']);
      expect(codes(pileP)).toEqual(['a', 'pTop']);
      expect(exists(b)).toBe(true);
      expect(pos(b)).toEqual(bPos);
      expect(containerOf(b)).toBeNull();
      expect(totalCards()).toBe(before);
      expect(linkedObjects()).toEqual([]);
    });
  });
});
