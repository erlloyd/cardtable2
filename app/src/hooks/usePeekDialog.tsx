import { useCallback, useState, type ReactElement } from 'react';
import type { CardEntry, GameAssets } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import {
  commitPeek,
  type PeekPlacement,
  type PeekShuffle,
} from '../store/YjsPeekActions';
import { resolveHomeZone } from '../store/YjsActions';
import { PeekModal } from '../components/PeekModal';
import { PeekCountDialog } from '../components/PeekCountDialog';
import { showToast } from '../toast/toastStore';
import { dbg } from '../dev/dbg';

interface PeekState {
  stackId: string | null;
  snapshot: CardEntry[];
  /** Stack size at open, the upper bound for N. */
  total: number;
  /** True when N came from the Other… dialog, so the modal has no N box. */
  fixedCount: boolean;
  /** Bumped per open or re-snapshot so the modal remounts with a fresh order. */
  key: number;
}

interface CountPromptState {
  stackId: string | null;
  /** Stack size at open, the upper bound for the number. */
  total: number;
  /** Bumped per open so the dialog remounts pre-filled. */
  key: number;
}

/** Same resolution as the hand actions: active hand, else first, else create. */
function resolveHandId(store: YjsStore, activeHandId: string | null): string {
  if (activeHandId) return activeHandId;
  const existingIds = store.getHandIds();
  return existingIds.length > 0 ? existingIds[0] : store.createHand('Hand 1');
}

/**
 * Hosts the peek dialog for a table route. `openPeek` is the `onOpenPeek`
 * ActionContext callback; render `peekDialog` once in the route.
 */
export function usePeekDialog(
  store: YjsStore | null,
  gameAssets: GameAssets | null,
  activeHandId: string | null,
): {
  openPeek: (
    stackId: string,
    count: number,
    options?: { askCount?: boolean },
  ) => void;
  peekDialog: ReactElement;
} {
  const [state, setState] = useState<PeekState>({
    stackId: null,
    snapshot: [],
    total: 0,
    fixedCount: false,
    key: 0,
  });
  const [prompt, setPrompt] = useState<CountPromptState>({
    stackId: null,
    total: 0,
    key: 0,
  });

  const showPeek = useCallback(
    (stackId: string, count: number, fixedCount: boolean) => {
      const cards = store?.getObjectYMap(stackId)?.get('_cards');
      if (!cards || cards.length === 0) return;
      setState((prev) => ({
        stackId,
        snapshot: cards.slice(0, Math.min(count, cards.length)),
        total: cards.length,
        fixedCount,
        key: prev.key + 1,
      }));
    },
    [store],
  );

  const openPeek = useCallback(
    (stackId: string, count: number, options?: { askCount?: boolean }) => {
      if (!options?.askCount) {
        showPeek(stackId, count, false);
        return;
      }
      const cards = store?.getObjectYMap(stackId)?.get('_cards');
      if (!cards || cards.length === 0) return;
      setPrompt((prev) => ({
        stackId,
        total: cards.length,
        key: prev.key + 1,
      }));
    },
    [store, showPeek],
  );

  const cancelPrompt = useCallback(() => {
    setPrompt((prev) => ({ ...prev, stackId: null }));
  }, []);

  const submitPrompt = useCallback(
    (count: number) => {
      if (prompt.stackId) showPeek(prompt.stackId, count, true);
      cancelPrompt();
    },
    [prompt.stackId, showPeek, cancelPrompt],
  );

  // Re-reads the live stack, so order and destinations reset to Top.
  const changeCount = useCallback(
    (count: number) => {
      setState((prev) => {
        const cards = prev.stackId
          ? store?.getObjectYMap(prev.stackId)?.get('_cards')
          : undefined;
        if (!cards || cards.length === 0) return prev;
        return {
          ...prev,
          snapshot: cards.slice(0, Math.min(count, cards.length)),
          total: cards.length,
          key: prev.key + 1,
        };
      });
    },
    [store],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, stackId: null }));
  }, []);

  const done = useCallback(
    (placements: PeekPlacement[], shuffle: PeekShuffle) => {
      if (store && state.stackId) {
        const handId = placements.some((p) => p.dest === 'hand')
          ? resolveHandId(store, activeHandId)
          : undefined;
        const result = commitPeek(
          store,
          state.stackId,
          state.snapshot,
          placements,
          { handId, ...shuffle },
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
    [store, activeHandId, state.stackId, state.snapshot, close],
  );

  const canDiscard = useCallback(
    (entry: CardEntry) => !!store && resolveHomeZone(store, entry) !== null,
    [store],
  );

  const getFaceUrl = useCallback(
    (code: string) => gameAssets?.cards[code]?.face ?? null,
    [gameAssets],
  );

  const peekDialog = (
    <>
      <PeekCountDialog
        key={`peek-count-${prompt.key}`}
        isOpen={prompt.stackId !== null}
        totalCount={prompt.total}
        onSubmit={submitPrompt}
        onCancel={cancelPrompt}
      />
      <PeekModal
        key={`peek-${state.key}`}
        isOpen={state.stackId !== null}
        cards={state.snapshot}
        totalCount={state.total}
        fixedCount={state.fixedCount}
        onChangeCount={changeCount}
        getFaceUrl={getFaceUrl}
        canDiscard={canDiscard}
        onDone={done}
        onClose={close}
      />
    </>
  );

  return { openPeek, peekDialog };
}
