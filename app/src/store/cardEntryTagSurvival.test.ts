import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectKind, type CardEntry } from '@cardtable2/shared';
import { YjsStore } from './YjsStore';
import {
  createObject,
  flipCards,
  stackObjects,
  unstackCard,
  shuffleStack,
  attachCards,
} from './YjsActions';
import {
  moveCardToHand,
  moveAllCardsToHand,
  moveCardToBoard,
  reorderCardInHand,
} from './YjsHandActions';

// Each action must move WHOLE entries: homeZone tags ride along with the card,
// and an untagged entry never gains a homeZone key.
const A: CardEntry = { code: 'a', homeZone: 'z1' };
const B: CardEntry = { code: 'b', homeZone: 'z2' };
const C: CardEntry = { code: 'c' };

const POS = { x: 0, y: 0, r: 0 };

describe('CardEntry tag survival through store actions', () => {
  let store: YjsStore;

  beforeEach(() => {
    store = new YjsStore('test-table');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  function makeStack(cards: CardEntry[], faceUp = true): string {
    return createObject(store, {
      kind: ObjectKind.Stack,
      pos: POS,
      cards: cards.map((e) => ({ ...e })),
      faceUp,
    });
  }

  function cardsOf(id: string): CardEntry[] {
    return store.getObjectYMap(id)!.get('_cards')!;
  }

  function sortByCode(entries: CardEntry[]): CardEntry[] {
    return [...entries].sort((x, y) => x.code.localeCompare(y.code));
  }

  it('createObject stores entries as given', () => {
    const id = makeStack([A, B, C]);
    expect(cardsOf(id)).toStrictEqual([A, B, C]);
  });

  it('stackObjects keeps source entries on top of target entries', () => {
    const target = makeStack([C]);
    const source = makeStack([A, B]);
    stackObjects(store, [source], target);
    expect(cardsOf(target)).toStrictEqual([A, B, C]);
  });

  it('unstackCard keeps the extracted entry and the remaining entries', () => {
    const id = makeStack([A, B, C]);
    const newId = unstackCard(store, id, { x: 50, y: 50, r: 0 });
    expect(cardsOf(newId!)).toStrictEqual([A]);
    expect(cardsOf(id)).toStrictEqual([B, C]);
  });

  it('shuffleStack keeps every entry intact', () => {
    const id = makeStack([A, B, C]);
    shuffleStack(store, id);
    expect(sortByCode(cardsOf(id))).toStrictEqual([A, B, C]);
  });

  it('flipCards reverses whole entries', () => {
    const id = makeStack([A, B, C]);
    flipCards(store, [id]);
    expect(cardsOf(id)).toStrictEqual([C, B, A]);
  });

  it('attachCards splits a multi-card stack into one stack per entry', () => {
    const target = makeStack([C]);
    const source = makeStack([A, B]);
    const attached = attachCards(store, [source], target);
    expect(attached).toHaveLength(2);
    expect(attached.map((id) => cardsOf(id)[0])).toStrictEqual([A, B]);
    attached.forEach((id) => expect(cardsOf(id)).toHaveLength(1));
  });

  it('moveCardToHand moves the entry into the hand', () => {
    const id = makeStack([A, B, C]);
    const hand = store.createHand('H');
    const moved = moveCardToHand(store, id, 1, hand);
    expect(moved).toStrictEqual(B);
    expect(store.getHandCards(hand)).toStrictEqual([B]);
    expect(cardsOf(id)).toStrictEqual([A, C]);
  });

  it('moveAllCardsToHand moves every entry into the hand', () => {
    const id = makeStack([A, B, C]);
    const hand = store.createHand('H');
    const moved = moveAllCardsToHand(store, id, hand);
    expect(moved).toStrictEqual([A, B, C]);
    expect(store.getHandCards(hand)).toStrictEqual([A, B, C]);
  });

  it('reorderCardInHand reorders whole entries', () => {
    const hand = store.createHand('H');
    store.addCardToHand(hand, { ...A });
    store.addCardToHand(hand, { ...B });
    store.addCardToHand(hand, { ...C });
    reorderCardInHand(store, hand, 0, 2);
    expect(store.getHandCards(hand)).toStrictEqual([B, C, A]);
  });

  it('moveCardToBoard creates a stack with the hand entry', () => {
    const hand = store.createHand('H');
    store.addCardToHand(hand, { ...A });
    store.addCardToHand(hand, { ...C });
    const newId = moveCardToBoard(store, hand, 0, { x: 5, y: 5, r: 0 }, true);
    expect(cardsOf(newId!)).toStrictEqual([A]);
    expect(store.getHandCards(hand)).toStrictEqual([C]);
  });

  it('round trip: stack -> unstack -> hand -> board -> stackObjects', () => {
    const deck = makeStack([A, B, C]);
    const other = makeStack([C]);

    const extractedStack = unstackCard(store, deck, { x: 10, y: 10, r: 0 })!;
    const hand = store.createHand('H');
    moveCardToHand(store, extractedStack, 0, hand);
    const boardStack = moveCardToBoard(
      store,
      hand,
      0,
      { x: 20, y: 20, r: 0 },
      true,
    )!;
    stackObjects(store, [boardStack], other);

    expect(cardsOf(other)).toStrictEqual([A, C]);
    expect(cardsOf(deck)).toStrictEqual([B, C]);
  });
});
