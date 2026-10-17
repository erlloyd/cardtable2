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
  /** Bumped per open so the modal remounts with a fresh order. */
  key: number;
}

interface CountPromptState {
  stackId: string | null;
  /** Stack size at open, the upper bound for the number. */
  total: number;
  /** Bumped per open so the dialog remounts pre-filled. */
  key: number;
}

/**
 * Same resolution as the hand actions: active hand, else first, else create.
 * Returns the existing hand id, or null when commitPeek must create one (only
 * once the commit is known to apply).
 */
function findHandId(store: YjsStore, activeHandId: string | null) {
  if (activeHandId) return activeHandId;
  return store.getHandIds()[0] ?? null;
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
  /** True while the count prompt or peek window is up. */
  isPeekOpen: boolean;
} {
  const [state, setState] = useState<PeekState>({
    stackId: null,
    snapshot: [],
    key: 0,
  });
  const [prompt, setPrompt] = useState<CountPromptState>({
    stackId: null,
    total: 0,
    key: 0,
  });

  const showPeek = useCallback(
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

  const openPeek = useCallback(
    (stackId: string, count: number, options?: { askCount?: boolean }) => {
      if (!options?.askCount) {
        showPeek(stackId, count);
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
      if (prompt.stackId) showPeek(prompt.stackId, count);
      cancelPrompt();
    },
    [prompt.stackId, showPeek, cancelPrompt],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, stackId: null }));
  }, []);

  const done = useCallback(
    (placements: PeekPlacement[], shuffle: PeekShuffle) => {
      if (store && state.stackId) {
        const handId = findHandId(store, activeHandId) ?? undefined;
        const result = commitPeek(
          store,
          state.stackId,
          state.snapshot,
          placements,
          { handId, createHand: () => store.createHand('Hand 1'), ...shuffle },
        );
        if (result === 'stale') {
          showToast(
            'The deck changed while you were looking; nothing was moved.',
          );
        } else if (result === 'invalid') {
          dbg('peek', 'commitPeek invalid', state.stackId);
          showToast('Could not apply the peek; nothing was moved.');
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
        getFaceUrl={getFaceUrl}
        canDiscard={canDiscard}
        onDone={done}
        onClose={close}
      />
    </>
  );

  return {
    openPeek,
    peekDialog,
    isPeekOpen: state.stackId !== null || prompt.stackId !== null,
  };
}
