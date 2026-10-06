import { useCallback, useState, type ReactElement } from 'react';
import type { YjsStore } from '../store/YjsStore';
import { setZoneLabel } from '../store/YjsActions';
import { RenameZoneModal } from '../components/RenameZoneModal';

interface RenameState {
  zoneId: string | null;
  initialLabel: string;
  /** Bumped per open so the modal remounts and re-prefills its input. */
  key: number;
}

/**
 * Hosts the zone rename dialog for a table route. `openRenameDialog` is the
 * `onOpenRenameDialog` ActionContext callback; render `renameDialog` once in
 * the route.
 */
export function useRenameZoneDialog(store: YjsStore | null): {
  openRenameDialog: (zoneId: string) => void;
  renameDialog: ReactElement;
} {
  const [state, setState] = useState<RenameState>({
    zoneId: null,
    initialLabel: '',
    key: 0,
  });

  const openRenameDialog = useCallback(
    (zoneId: string) => {
      const meta = store?.getObjectYMap(zoneId)?.get('_meta');
      setState((prev) => ({
        zoneId,
        initialLabel: (meta?.label as string | undefined) ?? '',
        key: prev.key + 1,
      }));
    },
    [store],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, zoneId: null }));
  }, []);

  const submit = useCallback(
    (label: string) => {
      if (store && state.zoneId) setZoneLabel(store, state.zoneId, label);
      close();
    },
    [store, state.zoneId, close],
  );

  const renameDialog = (
    <RenameZoneModal
      key={`rename-zone-${state.key}`}
      isOpen={state.zoneId !== null}
      onClose={close}
      onSubmit={submit}
      initialLabel={state.initialLabel}
    />
  );

  return { openRenameDialog, renameDialog };
}
