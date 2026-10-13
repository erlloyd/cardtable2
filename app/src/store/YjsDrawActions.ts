import type { YjsStore } from './YjsStore';
import { ObjectKind, type CardEntry, type Position } from '@cardtable2/shared';
import { unstackCard } from './YjsActions';
import { CARD_WIDTH, CARD_HEIGHT } from '../renderer/constants';

const TABLE_DRAW_GAP = 8;

/**
 * Validate a draw source and clamp the count to what the stack holds.
 * Returns null when the draw cannot happen.
 */
function resolveDraw(
  store: YjsStore,
  stackId: string,
  count: number,
): { cards: CardEntry[]; take: number } | null {
  if (count < 1) return null;
  const yMap = store.getObjectYMap(stackId);
  if (!yMap || yMap.get('_kind') !== ObjectKind.Stack) return null;
  const cards = yMap.get('_cards');
  if (!cards || cards.length === 0) return null;
  return { cards, take: Math.min(count, cards.length) };
}

/**
 * Draw the top `count` cards (index 0 is the top) of a stack into a hand,
 * appended in top-first order. Count clamps to the stack size; an emptied
 * stack is deleted.
 *
 * @returns The moved entries, or [] on failure
 */
export function drawCardsToHand(
  store: YjsStore,
  stackId: string,
  count: number,
  handId: string,
): CardEntry[] {
  const draw = resolveDraw(store, stackId, count);
  const handMap = store.hands.get(handId);
  if (!draw || !handMap) return [];

  const drawn = draw.cards.slice(0, draw.take);
  const remaining = draw.cards.slice(draw.take);

  store.getDoc().transact(() => {
    if (remaining.length === 0) {
      store.deleteObject(stackId);
    } else {
      store.getObjectYMap(stackId)?.set('_cards', remaining);
    }
    const handCards = (handMap.get('cards') as CardEntry[] | undefined) ?? [];
    handMap.set('cards', [...handCards, ...drawn]);
  });

  return drawn;
}

/**
 * Draw the top `count` cards of a stack onto the table as single-card stacks
 * in a row just below the source, top card first. Each new stack keeps the
 * source's facing and rotation. Count clamps to the stack size; an emptied
 * stack is deleted.
 *
 * @returns New stack ids in top-first order, or [] on failure
 */
export function drawCardsToTable(
  store: YjsStore,
  stackId: string,
  count: number,
): string[] {
  const draw = resolveDraw(store, stackId, count);
  if (!draw) return [];

  // The source map is gone once emptied, so read its position first.
  const source = store.getObjectYMap(stackId)?.get('_pos') as Position;
  const ids: string[] = [];

  store.getDoc().transact(() => {
    for (let i = 0; i < draw.take; i++) {
      const id = unstackCard(store, stackId, {
        x: source.x + i * (CARD_WIDTH + TABLE_DRAW_GAP),
        y: source.y + CARD_HEIGHT + TABLE_DRAW_GAP,
        r: source.r,
      });
      if (id) ids.push(id);
    }
  });

  return ids;
}
