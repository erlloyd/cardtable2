import { ObjectKind, type CardEntry } from '@cardtable2/shared';
import type { YjsStore } from './YjsStore';

export type PeekDestination = 'top' | 'bottom' | 'hand' | 'table' | 'discard';

export interface PeekPlacement {
  entry: CardEntry;
  dest: PeekDestination;
}

export type PeekCommitResult = 'applied' | 'stale' | 'invalid';

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
 *   'invalid' when the stack, placements or destinations cannot be applied.
 */
export function commitPeek(
  store: YjsStore,
  stackId: string,
  peeked: CardEntry[],
  placements: PeekPlacement[],
  _opts: { handId?: string },
): PeekCommitResult {
  const yMap = store.getObjectYMap(stackId);
  if (!yMap || yMap.get('_kind') !== ObjectKind.Stack) return 'invalid';
  if (peeked.length === 0) return 'invalid';
  if (!isPermutation(peeked, placements)) return 'invalid';
  if (placements.some((p) => p.dest !== 'top')) return 'invalid';

  const live = yMap.get('_cards') ?? [];
  if (live.length < peeked.length) return 'stale';
  if (!peeked.every((entry, i) => sameEntry(entry, live[i]))) return 'stale';

  store.getDoc().transact(() => {
    yMap.set('_cards', [
      ...placements.map((p) => p.entry),
      ...live.slice(peeked.length),
    ]);
  });
  return 'applied';
}
