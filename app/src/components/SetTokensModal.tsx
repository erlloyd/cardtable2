import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SetTokensTokenType {
  code: string;
  name: string;
  /** Current count, used to prefill the input (0 when absent). */
  count: number;
}

export interface SetTokensModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Called on Esc, backdrop click, or the close button. */
  onClose: () => void;
  /** Called with a count per token code on Enter or Set. */
  onSubmit: (counts: Record<string, number>) => void;
  /** Token types in manifest order. */
  tokenTypes: SetTokensTokenType[];
}

/** A blank input is 0; anything else must be an integer >= 0. */
function parseCount(text: string): number | null {
  if (text.trim() === '') return 0;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Modal for setting a card's token counts directly. Reuses the Deck Import
 * modal's visual language and is portaled to `document.body` for the same
 * reason (ancestor `backdrop-filter` breaks `position: fixed`). Hosts should
 * remount it per open (via `key`) so the inputs re-prefill from `tokenTypes`.
 */
export function SetTokensModal({
  isOpen,
  onClose,
  onSubmit,
  tokenTypes,
}: SetTokensModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tokenTypes.map((t) => [t.code, String(t.count)])),
  );
  // An unparseable draft ("-", "e", ".") reads back as '' from a number input,
  // indistinguishable from a blank field except via validity.badInput.
  const [badInputs, setBadInputs] = useState<Record<string, boolean>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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
    const focusInput = () => {
      firstInputRef.current?.focus();
      firstInputRef.current?.select();
    };
    // The command palette's Headless UI Dialog restores focus to its trigger
    // button when it unmounts (after its leave transition), which lands after
    // the initial focus below. Reclaim focus whenever it escapes the panel.
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !panelRef.current?.contains(e.target)) {
        focusInput();
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    const id = window.setTimeout(focusInput, 0);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      window.clearTimeout(id);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const counts: Record<string, number> = {};
  let canSubmit = !Object.values(badInputs).some(Boolean);
  for (const { code } of tokenTypes) {
    const parsed = parseCount(values[code] ?? '');
    if (parsed === null) {
      canSubmit = false;
    } else {
      counts[code] = parsed;
    }
  }

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(counts);
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
        ref={panelRef}
        className="deck-import-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Set tokens"
        data-testid="set-tokens-panel"
      >
        <div className="deck-import-header">
          <div className="deck-import-title">Set Tokens</div>
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
          {tokenTypes.map((t, i) => (
            <div key={t.code}>
              <label
                className="deck-import-label"
                htmlFor={`set-tokens-input-${t.code}`}
              >
                {t.name}
              </label>
              <input
                id={`set-tokens-input-${t.code}`}
                ref={i === 0 ? firstInputRef : undefined}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                className="deck-import-input"
                value={values[t.code] ?? ''}
                onChange={(e) => {
                  const { value, validity } = e.target;
                  setValues((prev) => ({ ...prev, [t.code]: value }));
                  setBadInputs((prev) => ({
                    ...prev,
                    [t.code]: validity.badInput,
                  }));
                }}
                onKeyDown={handleKeyDown}
                data-testid={`set-tokens-input-${t.code}`}
              />
            </div>
          ))}
        </div>

        <div className="deck-import-footer">
          <button
            type="button"
            className="deck-import-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="set-tokens-submit"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
