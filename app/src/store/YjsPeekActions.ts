import { ObjectKind, type CardEntry } from '@cardtable2/shared';
import type { YjsStore } from './YjsStore';
import { discardCardToZone, fisherYatesShuffle } from './YjsActions';
import { drawCardsToHand, drawCardsToTable } from './YjsDrawActions';

export type PeekDestination = 'top' | 'bottom' | 'hand' | 'table' | 'discard';

export interface PeekPlacement {
  entry: CardEntry;
  dest: PeekDestination;
}

export type PeekCommitResult = 'applied' | 'stale' | 'invalid';

export interface PeekShuffle {
  shuffleTop: boolean;
  shuffleBottom: boolean;
}

function sameEntry(a: CardEntry, b: CardEntry): boolean {
  return a.code === b.code && a.homeZone === b.homeZone;
}

function entryKey(entry: CardEntry): string {
  return `${entry.code}\u0000${entry.homeZone ?? ''}`;
}

/** True when `placements` holds exactly the entries of `peeked`, in any order. */
function isPermutation(
  peeked: CardEntry[],
  placements: PeekPlacement[],
): boolean {
  if (peeked.length !== placements.length) return false;
  const counts = new Map<string, number>();
  for (const entry of peeked) {
    const key = entryKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const { entry } of placements) {
    const key = entryKey(entry);
    const remaining = counts.get(key) ?? 0;
    if (remaining === 0) return false;
    counts.set(key, remaining - 1);
  }
  return true;
}

/**
 * Commit a peek: apply the final order and destinations of the top N cards.
 *
 * - `peeked` is the top-N snapshot taken when the modal opened (index 0 = top).
 * - `placements` is the final display order: a permutation of `peeked` with a
 *   destination per card.
 * - Returns 'stale' when the live top N no longer equals `peeked`, and
 *   'invalid' when the stack, placements or destinations cannot be applied
 *   (including 'hand' placements with neither an existing `opts.handId` nor an
 *   `opts.createHand`).
 * - `opts.createHand` supplies the hand only once the commit is known to
 *   apply, so a 'stale'/'invalid' result never creates one.
 * - The stack is rebuilt as hand, table, discard, top, rest, bottom so each
 *   draw/discard step takes the current top of the stack. A step that empties
 *   the stack deletes it, so later steps only run while it still exists.
 * - `opts.shuffleTop` / `opts.shuffleBottom` randomize only that group; the
 *   other groups keep window order.
 * - Discarding stops at the first card with no home zone; the remaining
 *   discard cards stay on top of the stack.
 */
export function commitPeek(
  store: YjsStore,
  stackId: string,
  peeked: CardEntry[],
  placements: PeekPlacement[],
  opts: { handId?: string; createHand?: () => string } & Partial<PeekShuffle>,
): PeekCommitResult {
  const yMap = store.getObjectYMap(stackId);
  if (!yMap || yMap.get('_kind') !== ObjectKind.Stack) return 'invalid';
  if (peeked.length === 0) return 'invalid';
  if (!isPermutation(peeked, placements)) return 'invalid';

  const group = (dest: PeekDestination): CardEntry[] =>
    placements.filter((p) => p.dest === dest).map((p) => p.entry);
  const hand = group('hand');
  const table = group('table');
  const discard = group('discard');
  const topGroup = opts.shuffleTop
    ? fisherYatesShuffle(group('top'))
    : group('top');
  const bottomGroup = opts.shuffleBottom
    ? fisherYatesShuffle(group('bottom'))
    : group('bottom');
  if (hand.length > 0) {
    const missingHand = opts.handId
      ? !store.hands.get(opts.handId)
      : !opts.createHand;
    if (missingHand) return 'invalid';
  }

  const live = yMap.get('_cards') ?? [];
  if (live.length < peeked.length) return 'stale';
  if (!peeked.every((entry, i) => sameEntry(entry, live[i]))) return 'stale';

  store.getDoc().transact(() => {
    const handId =
      hand.length > 0 ? (opts.handId ?? opts.createHand?.()) : undefined;
    yMap.set('_cards', [
      ...hand,
      ...table,
      ...discard,
      ...topGroup,
      ...live.slice(peeked.length),
      ...bottomGroup,
    ]);

    if (hand.length > 0 && handId) {
      drawCardsToHand(store, stackId, hand.length, handId);
    }
    if (table.length > 0 && store.getObjectYMap(stackId)) {
      for (const id of drawCardsToTable(store, stackId, table.length)) {
        store.getObjectYMap(id)?.set('_faceUp', true);
      }
    }
    for (let i = 0; i < discard.length && store.getObjectYMap(stackId); i++) {
      if (discardCardToZone(store, stackId).result === 'no-home') break;
    }
  });
  return 'applied';
}
