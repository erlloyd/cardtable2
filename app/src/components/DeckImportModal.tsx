import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Display labels driving the provider-source's input modal. Mirrors the
 * `LoadableProviderLabels` shape from the shared schema; kept as a local
 * interface here so the modal can be tested in isolation without dragging
 * the shared types alias chain in.
 */
export interface DeckImportModalLabels {
  /** Provider site name (e.g. "MarvelCDB") — surfaced in the modal header. */
  siteName: string;
  /** Placeholder text shown in the deck-id input. */
  inputPlaceholder: string;
}

export interface DeckImportModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Called when the user dismisses the modal (Esc, backdrop, or back button). */
  onClose: () => void;
  /**
   * Called when the user clicks Import (or presses Enter with a non-empty
   * deck id). The host runs the actual import and surfaces errors via the
   * `error` prop; this component does not run the import itself.
   */
  onSubmit: (deckId: string, isPrivate: boolean) => void;
  /** Labels driving the modal title + input placeholder. */
  labels: DeckImportModalLabels;
  /**
   * When true, the modal renders a "Use private deck ID" checkbox. Hosts
   * pass `true` only when the provider config declares a private endpoint.
   */
  supportsPrivate?: boolean;
  /** Disables the input + button while an import is running. */
  loading?: boolean;
  /** Last error message from the host's import attempt; rendered above the input. */
  error?: string | null;
}

/**
 * Modal for collecting a deck-import provider's input (deck id + optional
 * private flag).
 *
 * Replaces the legacy `window.prompt()` driven flow. Same visual language as
 * `LoadPickerModal` (glass-morphism panel, blurred backdrop, keyboard-driven)
 * and portaled to `document.body` — both to escape any ancestor with
 * `backdrop-filter: blur(...)` (which would otherwise become a containing
 * block for `position: fixed` and break the overlay) and to ensure stacking
 * above the rest of the app.
 *
 * The modal owns input state but does NOT own loading state — the host runs
 * the import asynchronously and toggles `loading` / `error` props.
 */
export function DeckImportModal({
  isOpen,
  onClose,
  onSubmit,
  labels,
  supportsPrivate = false,
  loading = false,
  error = null,
}: DeckImportModalProps) {
  const [deckId, setDeckId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset transient input state every time the modal opens — closing without
  // a reset would leak the previous attempt's deck id into the next open.
  useEffect(() => {
    if (isOpen) {
      setDeckId('');
      setIsPrivate(false);
    }
  }, [isOpen]);

  // Esc closes; effective only while open so it doesn't capture Esc in the
  // background.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, loading, onClose]);

  // Auto-focus the deck-id input on open. Defer one tick so the portal has
  // mounted into document.body before we look up the element.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = deckId.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed, isPrivate);
  };

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const modal = (
    <div
      className="deck-import-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="deck-import-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Import ${labels.siteName} deck`}
        data-testid="deck-import-panel"
      >
        <div className="deck-import-header">
          <div className="deck-import-title">Import {labels.siteName} Deck</div>
          <button
            type="button"
            className="deck-import-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            {'✕'}
          </button>
        </div>

        {error && (
          <div className="deck-import-error" role="alert">
            {error}
          </div>
        )}

        <div className="deck-import-body">
          <label className="deck-import-label" htmlFor="deck-import-id-input">
            {labels.siteName} Deck ID
          </label>
          <input
            id="deck-import-id-input"
            ref={inputRef}
            type="text"
            className="deck-import-input"
            value={deckId}
            placeholder={labels.inputPlaceholder}
            onChange={(e) => setDeckId(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
            data-testid="deck-import-id-input"
          />

          {supportsPrivate && (
            <label className="deck-import-checkbox-label">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                disabled={loading}
              />
              Use private deck ID
            </label>
          )}
        </div>

        <div className="deck-import-footer">
          <button
            type="button"
            className="deck-import-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="deck-import-submit"
          >
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
