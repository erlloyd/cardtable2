import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RenameZoneModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Called on Esc, backdrop click, or the close button. */
  onClose: () => void;
  /** Called with the trimmed, non-empty label on Enter or Rename. */
  onSubmit: (label: string) => void;
  /** Current label, used to prefill the input. */
  initialLabel: string;
}

/**
 * Small modal for renaming a zone. Reuses the Deck Import modal's visual
 * language and is portaled to `document.body` for the same reason (ancestor
 * `backdrop-filter` breaks `position: fixed`). Hosts should remount it per
 * open (via `key`) so the input re-prefills from `initialLabel`.
 */
export function RenameZoneModal({
  isOpen,
  onClose,
  onSubmit,
  initialLabel,
}: RenameZoneModalProps) {
  const [label, setLabel] = useState(initialLabel);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = label.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const modal = (
    <div
      className="deck-import-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="deck-import-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Rename zone"
        data-testid="rename-zone-panel"
      >
        <div className="deck-import-header">
          <div className="deck-import-title">Rename Zone</div>
          <button
            type="button"
            className="deck-import-close"
            onClick={onClose}
            aria-label="Close"
          >
            {'✕'}
          </button>
        </div>

        <div className="deck-import-body">
          <label className="deck-import-label" htmlFor="rename-zone-input">
            Label
          </label>
          <input
            id="rename-zone-input"
            ref={inputRef}
            type="text"
            className="deck-import-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
            data-testid="rename-zone-input"
          />
        </div>

        <div className="deck-import-footer">
          <button
            type="button"
            className="deck-import-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="rename-zone-submit"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
