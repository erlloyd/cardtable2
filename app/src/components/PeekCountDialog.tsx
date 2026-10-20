import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DEFAULT_COUNT = 3;

export interface PeekCountDialogProps {
  isOpen: boolean;
  /** Stack size, the upper bound for the number. */
  totalCount: number;
  /** Called with the number clamped to 1..totalCount. */
  onSubmit: (count: number) => void;
  /** Called on Cancel, Esc, or backdrop click. */
  onCancel: () => void;
}

/**
 * Small dialog asking how many cards to peek at, shown before the peek
 * window. Portaled to `document.body` (ancestor `backdrop-filter` breaks
 * `position: fixed`). Hosts remount it per open via `key`.
 */
export function PeekCountDialog({
  isOpen,
  totalCount,
  onSubmit,
  onCancel,
}: PeekCountDialogProps) {
  const initial = Math.max(1, Math.min(totalCount, DEFAULT_COUNT));
  const [draft, setDraft] = useState(String(initial));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const submit = () => {
    const parsed = Math.trunc(Number(draft));
    const count =
      draft.trim() === '' || !Number.isFinite(parsed) ? initial : parsed;
    onSubmit(Math.max(1, Math.min(totalCount, count)));
  };

  const dialog = (
    <div
      className="deck-import-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="deck-import-panel peek-count-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Peek at how many cards"
        data-testid="peek-count-dialog"
      >
        <div className="deck-import-title">Peek at how many cards?</div>
        <label className="peek-modal-count peek-count-field">
          Cards
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={totalCount}
            value={draft}
            data-testid="peek-count-input"
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          of {totalCount}
        </label>
        <div className="deck-import-footer peek-modal-footer">
          <button
            type="button"
            className="peek-modal-cancel"
            onClick={onCancel}
            data-testid="peek-count-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="deck-import-submit"
            onClick={submit}
            data-testid="peek-count-ok"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
