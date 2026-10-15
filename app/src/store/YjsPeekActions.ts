import type { CardEntry } from '@cardtable2/shared';
import type { YjsStore } from './YjsStore';

export type PeekDestination = 'top' | 'bottom' | 'hand' | 'table' | 'discard';

export interface PeekPlacement {
  entry: CardEntry;
  dest: PeekDestination;
}

export type PeekCommitResult = 'applied' | 'stale' | 'invalid';

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
  _store: YjsStore,
  _stackId: string,
  _peeked: CardEntry[],
  _placements: PeekPlacement[],
  _opts: { handId?: string },
): PeekCommitResult {
  return 'invalid';
}
