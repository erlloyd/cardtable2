import { useCallback, useState, type ReactElement } from 'react';
import type { YjsStore } from '../store/YjsStore';
import { stackObjects } from '../store/YjsActions';
import type { AttachmentMergeChoice } from '../store/attachmentMerge';
import { MergeAttachmentsModal } from '../components/MergeAttachmentsModal';
import { showToast } from '../toast/toastStore';

interface PendingMerge {
  ids: string[];
  targetId: string;
}

/**
 * Hosts the "what should the merged stack keep?" dialog. `requestMergeChoice`
 * holds a stack drop until the player answers; render `mergeDialog` once.
 */
export function useMergeAttachmentsDialog(store: YjsStore): {
  requestMergeChoice: (ids: string[], targetId: string) => void;
  mergeDialog: ReactElement;
} {
  const [pending, setPending] = useState<PendingMerge | null>(null);

  const requestMergeChoice = useCallback((ids: string[], targetId: string) => {
    setPending({ ids, targetId });
  }, []);

  const onChoose = useCallback(
    (choice: AttachmentMergeChoice) => {
      if (pending) {
        try {
          stackObjects(store, pending.ids, pending.targetId, choice);
        } catch (error) {
          console.error('[useMergeAttachmentsDialog] Merge failed', error);
          showToast('Could not merge the stacks.', 'error');
        }
      }
      setPending(null);
    },
    [store, pending],
  );

  const mergeDialog = (
    <MergeAttachmentsModal isOpen={pending !== null} onChoose={onChoose} />
  );

  return { requestMergeChoice, mergeDialog };
}
