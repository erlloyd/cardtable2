import { useCallback, useState, type ReactElement } from 'react';
import type { CardEntry, GameAssets } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import { commitPeek, type PeekPlacement } from '../store/YjsPeekActions';
import { PeekModal } from '../components/PeekModal';
import { showToast } from '../toast/toastStore';
import { dbg } from '../dev/dbg';

interface PeekState {
  stackId: string | null;
  snapshot: CardEntry[];
  /** Bumped per open so the modal remounts with a fresh order. */
  key: number;
}

/**
 * Hosts the peek dialog for a table route. `openPeek` is the `onOpenPeek`
 * ActionContext callback; render `peekDialog` once in the route.
 */
export function usePeekDialog(
  store: YjsStore | null,
  gameAssets: GameAssets | null,
): {
  openPeek: (stackId: string, count: number) => void;
  peekDialog: ReactElement;
} {
  const [state, setState] = useState<PeekState>({
    stackId: null,
    snapshot: [],
    key: 0,
  });

  const openPeek = useCallback(
    (stackId: string, count: number) => {
      const cards = store?.getObjectYMap(stackId)?.get('_cards');
      if (!cards || cards.length === 0) return;
      setState((prev) => ({
        stackId,
        snapshot: cards.slice(0, Math.min(count, cards.length)),
        key: prev.key + 1,
      }));
    },
    [store],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, stackId: null }));
  }, []);

  const done = useCallback(
    (placements: PeekPlacement[]) => {
      if (store && state.stackId) {
        const result = commitPeek(
          store,
          state.stackId,
          state.snapshot,
          placements,
          {},
        );
        if (result === 'stale') {
          showToast(
            'The deck changed while you were looking; nothing was moved.',
          );
        } else if (result === 'invalid') {
          dbg('peek', 'commitPeek invalid', state.stackId);
        }
      }
      close();
    },
    [store, state.stackId, state.snapshot, close],
  );

  const getFaceUrl = useCallback(
    (code: string) => gameAssets?.cards[code]?.face ?? null,
    [gameAssets],
  );

  const peekDialog = (
    <PeekModal
      key={`peek-${state.key}`}
      isOpen={state.stackId !== null}
      cards={state.snapshot}
      getFaceUrl={getFaceUrl}
      onDone={done}
      onClose={close}
    />
  );

  return { openPeek, peekDialog };
}
