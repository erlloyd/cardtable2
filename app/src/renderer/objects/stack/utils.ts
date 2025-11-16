import type { TableObject } from '@cardtable2/shared';
import { STACK_DEFAULT_COLOR } from './constants';

/** Get the color for a stack, with fallback to default */
export function getStackColor(obj: TableObject): number {
  return (obj._meta?.color as number) ?? STACK_DEFAULT_COLOR;
}

/** Get the number of cards in a stack */
export function getCardCount(obj: TableObject): number {
  if ('_cards' in obj && Array.isArray(obj._cards)) {
    return obj._cards.length;
  }
  return 0;
}

/** Check if stack is face up */
export function isFaceUp(obj: TableObject): boolean {
  if ('_faceUp' in obj) {
    return obj._faceUp as boolean;
  }
  return true;
}
