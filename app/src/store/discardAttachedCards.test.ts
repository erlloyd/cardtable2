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
});
