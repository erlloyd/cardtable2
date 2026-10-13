import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AttachmentMergeChoice } from '../store/attachmentMerge';

export interface MergeAttachmentsModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Called with the answer. The modal has no other way to close. */
  onChoose: (choice: AttachmentMergeChoice) => void;
}

/**
 * Asks what a merged stack keeps when both sides carry tokens or statuses.
 * Deliberately undismissable: no close button, and Escape or a backdrop click
 * do nothing. Portaled to `document.body` because ancestor `backdrop-filter`
 * breaks `position: fixed`.
 */
export function MergeAttachmentsModal({
  isOpen,
  onChoose,
}: MergeAttachmentsModalProps) {
  const mergeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const focusPrimary = () => mergeButtonRef.current?.focus();
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !panelRef.current?.contains(e.target)) {
        focusPrimary();
      }
    };
    // The drop is held and the dragged card is still selected, so a table
    // shortcut could destroy it. Capture runs before the table's window
    // listener; Tab, Enter and Space stay with the dialog's own buttons.
    const blockShortcuts = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') return;
      e.stopImmediatePropagation();
    };
    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('keydown', blockShortcuts, true);
    const id = window.setTimeout(focusPrimary, 0);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('keydown', blockShortcuts, true);
      window.clearTimeout(id);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modal = (
    <div
      className="deck-import-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        ref={panelRef}
        className="deck-import-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Both have tokens"
        data-testid="merge-attachments-panel"
      >
        <div className="deck-import-header">
          <div className="deck-import-title">Both have tokens</div>
        </div>

        <div className="deck-import-body merge-attachments-body">
          The stack and the card you dropped both have tokens or statuses. What
          should the merged stack keep?
        </div>

        <div className="deck-import-footer merge-attachments-footer">
          <button
            ref={mergeButtonRef}
            type="button"
            className="deck-import-submit"
            onClick={() => onChoose('merge')}
            data-testid="merge-attachments-merge"
          >
            Combine both
          </button>
          <button
            type="button"
            className="deck-import-submit"
            onClick={() => onChoose('target')}
            data-testid="merge-attachments-target"
          >
            Keep the stack&apos;s
          </button>
          <button
            type="button"
            className="deck-import-submit"
            onClick={() => onChoose('source')}
            data-testid="merge-attachments-source"
          >
            Keep the dragged card&apos;s
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
