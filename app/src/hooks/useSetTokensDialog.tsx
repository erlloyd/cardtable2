import { useCallback, useState, type ReactElement } from 'react';
import type { AttachmentData } from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import { setStackTokenCounts } from '../store/YjsActions';
import {
  SetTokensModal,
  type SetTokensTokenType,
} from '../components/SetTokensModal';

interface SetTokensState {
  stackId: string | null;
  tokenTypes: SetTokensTokenType[];
  /** Bumped per open so the modal remounts and re-prefills its inputs. */
  key: number;
}

/**
 * Hosts the Set Tokens dialog for a table route. `openSetTokensDialog` is the
 * `onOpenSetTokensDialog` ActionContext callback; render `setTokensDialog`
 * once in the route. The target stack is captured at open time.
 */
export function useSetTokensDialog(store: YjsStore | null): {
  openSetTokensDialog: (stackId: string) => void;
  setTokensDialog: ReactElement;
} {
  const [state, setState] = useState<SetTokensState>({
    stackId: null,
    tokenTypes: [],
    key: 0,
  });

  const openSetTokensDialog = useCallback(
    (stackId: string) => {
      if (!store) return;
      const meta = store.getObjectYMap(stackId)?.get('_meta');
      const attachments = meta?.attachments as AttachmentData | undefined;
      const current = attachments?.tokens ?? {};
      const tokenTypes = Object.entries(
        store.getGameAssets()?.tokenTypes ?? {},
      ).map(([code, def]) => ({
        code,
        name: def.name,
        count: current[code] ?? 0,
      }));
      setState((prev) => ({ stackId, tokenTypes, key: prev.key + 1 }));
    },
    [store],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, stackId: null }));
  }, []);

  const submit = useCallback(
    (counts: Record<string, number>) => {
      if (store && state.stackId) {
        setStackTokenCounts(store, state.stackId, counts);
      }
      close();
    },
    [store, state.stackId, close],
  );

  const setTokensDialog = (
    <SetTokensModal
      key={`set-tokens-${state.key}`}
      isOpen={state.stackId !== null}
      onClose={close}
      onSubmit={submit}
      tokenTypes={state.tokenTypes}
    />
  );

  return { openSetTokensDialog, setTokensDialog };
}
