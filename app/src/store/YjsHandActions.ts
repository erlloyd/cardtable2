import type { YjsStore } from './YjsStore';
import { ObjectKind, type Position } from '@cardtable2/shared';
import { createObject } from './YjsActions';

/**
 * Hand Actions for moving cards between the board and player hands.
 *
 * All actions execute within Yjs transactions for atomicity.
 */

/**
 * Move the top card (or card at cardIndex) from a board stack into a hand.
 *
 * In a single transaction:
 * - Extracts the card from the stack's _cards array
 * - Deletes the stack if it was the last card
 * - Adds the card to the hand at the specified index (or appends)
 *
 * @returns The extracted card ID, or null if the operation failed
 */
export function moveCardToHand(
  store: YjsStore,
  stackId: string,
  cardIndex: number,
  handId: string,
  handInsertIndex?: number,
): string | null {
  const yMap = store.getObjectYMap(stackId);
  if (!yMap) {
    console.warn(`[moveCardToHand] Stack ${stackId} not found`);
    return null;
  }

  const kind = yMap.get('_kind');
  if (kind !== ObjectKind.Stack) {
    console.warn(
      `[moveCardToHand] Object ${stackId} is not a stack (kind: ${String(kind)})`,
    );
    return null;
  }

  const cards = yMap.get('_cards');
  if (!cards || cards.length === 0) {
    console.warn(`[moveCardToHand] Stack ${stackId} has no cards`);
    return null;
  }

  if (cardIndex < 0 || cardIndex >= cards.length) {
    console.warn(
      `[moveCardToHand] Card index ${cardIndex} out of range for stack ${stackId} (${cards.length} cards)`,
    );
    return null;
  }

  const handMap = store.hands.get(handId);
  if (!handMap) {
    console.warn(`[moveCardToHand] Hand ${handId} not found`);
    return null;
  }

  let extractedCard: string | null = null;

  store.getDoc().transact(() => {
    const currentCards = [...(yMap.get('_cards') as string[])];
    extractedCard = currentCards.splice(cardIndex, 1)[0];

    if (currentCards.length === 0) {
      store.deleteObject(stackId);
    } else {
      yMap.set('_cards', currentCards);
    }

    const handCards = [...((handMap.get('cards') as string[]) ?? [])];
    if (
      handInsertIndex !== undefined &&
      handInsertIndex >= 0 &&
      handInsertIndex <= handCards.length
    ) {
      handCards.splice(handInsertIndex, 0, extractedCard);
    } else {
      handCards.push(extractedCard);
    }
    handMap.set('cards', handCards);
  });

  if (extractedCard) {
    console.log(
      '[moveCardToHand] Moved card',
      extractedCard,
      'from stack',
      stackId,
      'to hand',
      handId,
    );
  }

  return extractedCard;
}

/**
 * Move all cards from a board stack into a hand.
 *
 * In a single transaction:
 * - Extracts all cards from the stack
 * - Deletes the stack from the board
 * - Appends all cards to the hand
 *
 * @returns The extracted card IDs, or empty array if the operation failed
 */
export function moveAllCardsToHand(
  store: YjsStore,
  stackId: string,
  handId: string,
): string[] {
  const yMap = store.getObjectYMap(stackId);
  if (!yMap) {
    console.warn(`[moveAllCardsToHand] Stack ${stackId} not found`);
    return [];
  }

  const kind = yMap.get('_kind');
  if (kind !== ObjectKind.Stack) {
    console.warn(
      `[moveAllCardsToHand] Object ${stackId} is not a stack (kind: ${String(kind)})`,
    );
    return [];
  }

  const cards = yMap.get('_cards');
  if (!cards || cards.length === 0) {
    console.warn(`[moveAllCardsToHand] Stack ${stackId} has no cards`);
    return [];
  }

  const handMap = store.hands.get(handId);
  if (!handMap) {
    console.warn(`[moveAllCardsToHand] Hand ${handId} not found`);
    return [];
  }

  const extractedCards = [...cards];

  store.getDoc().transact(() => {
    store.deleteObject(stackId);

    const handCards = [...((handMap.get('cards') as string[]) ?? [])];
    handCards.push(...extractedCards);
    handMap.set('cards', handCards);
  });

  console.log(
    '[moveAllCardsToHand] Moved',
    extractedCards.length,
    'cards from stack',
    stackId,
    'to hand',
    handId,
  );

  return extractedCards;
}

/**
 * Move a card from a hand back to the board as a new single-card stack.
 *
 * - Removes the card from the hand
 * - Creates a new stack on the board with the card
 *
 * @returns The new stack ID, or null if the operation failed
 */
export function moveCardToBoard(
  store: YjsStore,
  handId: string,
  cardIndex: number,
  pos: Position,
  faceUp: boolean,
): string | null {
  const handMap = store.hands.get(handId);
  if (!handMap) {
    console.warn(`[moveCardToBoard] Hand ${handId} not found`);
    return null;
  }

  const handCards = (handMap.get('cards') as string[]) ?? [];
  if (cardIndex < 0 || cardIndex >= handCards.length) {
    console.warn(
      `[moveCardToBoard] Card index ${cardIndex} out of range for hand ${handId} (${handCards.length} cards)`,
    );
    return null;
  }

  let newStackId: string | null = null;

  store.getDoc().transact(() => {
    const cards = [...(handMap.get('cards') as string[])];
    const cardId = cards.splice(cardIndex, 1)[0];
    handMap.set('cards', cards);

    newStackId = createObject(store, {
      kind: ObjectKind.Stack,
      pos,
      cards: [cardId],
      faceUp,
    });
  });

  if (newStackId) {
    console.log(
      '[moveCardToBoard] Moved card from hand',
      handId,
      'to board as stack',
      newStackId,
    );
  }

  return newStackId;
}

/**
 * Reorder a card within a hand by moving it from one index to another.
 *
 * In a single transaction:
 * - Removes the card at fromIndex
 * - Inserts it at toIndex
 *
 * No-op if indices are equal or invalid.
 */
export function reorderCardInHand(
  store: YjsStore,
  handId: string,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex === toIndex) return;

  const handMap = store.hands.get(handId);
  if (!handMap) {
    console.warn(`[reorderCardInHand] Hand ${handId} not found`);
    return;
  }

  const handCards = (handMap.get('cards') as string[]) ?? [];
  if (fromIndex < 0 || fromIndex >= handCards.length) {
    console.warn(
      `[reorderCardInHand] fromIndex ${fromIndex} out of range (${handCards.length} cards)`,
    );
    return;
  }

  const clampedTo = Math.max(0, Math.min(toIndex, handCards.length - 1));

  store.getDoc().transact(() => {
    const cards = [...(handMap.get('cards') as string[])];
    const [card] = cards.splice(fromIndex, 1);
    cards.splice(clampedTo, 0, card);
    handMap.set('cards', cards);
  });
}
