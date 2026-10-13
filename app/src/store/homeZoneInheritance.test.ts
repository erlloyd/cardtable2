import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectKind, type CardEntry } from '@cardtable2/shared';
import { YjsStore } from './YjsStore';
import { createObject, stackObjects, discardCardToZone } from './YjsActions';

const POS = { x: 0, y: 0, r: 0 };

describe('stackObjects home zone inheritance', () => {
  let store: YjsStore;
  let zoneA: string;
  let zoneB: string;

  beforeEach(() => {
    store = new YjsStore('test-home-zone-inheritance');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    zoneA = makeZone();
    zoneB = makeZone();
  });

  function makeZone(): string {
    return createObject(store, {
      kind: ObjectKind.Zone,
      pos: POS,
      meta: { isDiscardZone: true, width: 200, height: 200 },
    });
  }

  function makeStack(cards: CardEntry[]): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: POS,
      cards: cards.map((e) => ({ ...e })),
      faceUp: false,
    });
  }

  function cardsOf(id: string): CardEntry[] {
    return store.getObjectYMap(id)!.get('_cards')!;
  }

  function zonesOf(id: string): Array<string | undefined> {
    return cardsOf(id).map((e) => e.homeZone);
  }

  it('gives an untagged incoming card the zone of the target', () => {
    const target = makeStack([
      { code: 't1', homeZone: zoneA },
      { code: 't2', homeZone: zoneA },
    ]);
    const source = makeStack([{ code: 's1' }]);
    stackObjects(store, [source], target);
    expect(cardsOf(target).map((e) => e.code)).toEqual(['s1', 't1', 't2']);
    expect(zonesOf(target)).toEqual([zoneA, zoneA, zoneA]);
  });

  it('keeps the existing home zone of an incoming tagged card', () => {
    const target = makeStack([{ code: 't1', homeZone: zoneA }]);
    const source = makeStack([{ code: 's1', homeZone: zoneB }]);
    stackObjects(store, [source], target);
    expect(zonesOf(target)).toEqual([zoneB, zoneA]);
  });

  it('uses the most common zone of a mixed target', () => {
    const target = makeStack([
      { code: 't1', homeZone: zoneB },
      { code: 't2', homeZone: zoneA },
      { code: 't3', homeZone: zoneA },
      { code: 't4', homeZone: zoneA },
    ]);
    const source = makeStack([{ code: 's1' }]);
    stackObjects(store, [source], target);
    expect(zonesOf(target)).toEqual([zoneA, zoneB, zoneA, zoneA, zoneA]);
  });

  it('breaks a tie toward the zone of the card nearer the top', () => {
    const target = makeStack([
      { code: 't1', homeZone: zoneB },
      { code: 't2', homeZone: zoneA },
    ]);
    const source = makeStack([{ code: 's1' }]);
    stackObjects(store, [source], target);
    expect(cardsOf(target)[0]).toEqual({ code: 's1', homeZone: zoneB });
  });

  it('treats a tag pointing at a non-discard object as no home', () => {
    const notAZone = makeStack([{ code: 'other' }]);
    const target = makeStack([{ code: 't1', homeZone: zoneA }]);
    const source = makeStack([{ code: 's1', homeZone: notAZone }]);
    stackObjects(store, [source], target);
    expect(zonesOf(target)).toEqual([zoneA, zoneA]);
  });

  it('falls back to the incoming zone when the target has none', () => {
    const target = makeStack([{ code: 't1' }]);
    const source = makeStack([
      { code: 's1', homeZone: zoneA },
      { code: 's2', homeZone: zoneA },
    ]);
    stackObjects(store, [source], target);
    expect(cardsOf(target).map((e) => e.code)).toEqual(['s1', 's2', 't1']);
    expect(zonesOf(target)).toEqual([zoneA, zoneA, zoneA]);
  });

  it('tags an untagged card already inside the target', () => {
    const target = makeStack([{ code: 't1' }, { code: 't2' }]);
    const source = makeStack([{ code: 's1', homeZone: zoneA }]);
    stackObjects(store, [source], target);
    expect(zonesOf(target)).toEqual([zoneA, zoneA, zoneA]);
  });

  it('leaves entries unchanged when neither side has a zone', () => {
    const t1: CardEntry = { code: 't1' };
    const s1: CardEntry = { code: 's1' };
    const target = makeStack([t1]);
    const source = makeStack([s1]);
    stackObjects(store, [source], target);
    const result = cardsOf(target);
    expect(result).toStrictEqual([s1, t1]);
    expect(result[0]).not.toHaveProperty('homeZone');
    expect(result[1]).not.toHaveProperty('homeZone');
  });

  describe('lone card and a zone pile', () => {
    let pile: string;
    let card: string;

    beforeEach(() => {
      pile = makeStack([
        { code: 'p1', homeZone: zoneA },
        { code: 'p2', homeZone: zoneA },
        { code: 'p3', homeZone: zoneA },
      ]);
      store.getObjectYMap(pile)!.set('_containerId', zoneA);
      card = makeStack([{ code: 'c1' }]);
    });

    it('pile dropped onto the card tags all four entries', () => {
      stackObjects(store, [pile], card);
      expect(cardsOf(card)).toHaveLength(4);
      expect(zonesOf(card)).toEqual([zoneA, zoneA, zoneA, zoneA]);
    });

    it('card dropped onto the pile tags all four and keeps the container', () => {
      stackObjects(store, [card], pile);
      expect(cardsOf(pile)).toHaveLength(4);
      expect(zonesOf(pile)).toEqual([zoneA, zoneA, zoneA, zoneA]);
      expect(store.getObjectYMap(pile)!.get('_containerId')).toBe(zoneA);
    });
  });

  it('discardCardToZone routes a tagged card and refuses an untagged one', () => {
    const tagged = makeStack([{ code: 't1', homeZone: zoneA }]);
    const untagged = makeStack([{ code: 'u1' }]);
    expect(discardCardToZone(store, tagged)).toBe('routed');
    expect(discardCardToZone(store, untagged)).toBe('no-home');
  });
});
