import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardEntry } from '@cardtable2/shared';
import type { PeekDestination, PeekPlacement } from '../store/YjsPeekActions';
import { getPreviewDimensions } from '../constants/previewSizes';
import { computeShiftOffset } from './handShift';

const DRAG_SLOP = 5;
const CARD_GAP = 8;

export interface PeekModalProps {
  isOpen: boolean;
  /** Top-N snapshot, top card first. */
  cards: CardEntry[];
  /** Stack size, the upper bound for the N input. */
  totalCount: number;
  /** Focus and select the N input on open. */
  focusCount?: boolean;
  /** Asks the host to re-snapshot the top `count` cards, which remounts this
   * modal and so resets order and destinations. */
  onChangeCount: (count: number) => void;
  getFaceUrl: (code: string) => string | null;
  /** True when the entry has a discard zone to go to. */
  canDiscard: (entry: CardEntry) => boolean;
  /** Called with every card and its chosen dest, in display order. */
  onDone: (placements: PeekPlacement[]) => void;
  /** Called on Cancel, Esc, backdrop click, or the close button. */
  onClose: () => void;
}

const DESTINATIONS: { value: PeekDestination; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'hand', label: 'Hand' },
  { value: 'table', label: 'Table' },
  { value: 'discard', label: 'Discard' },
];

interface DragSession {
  from: number;
  startX: number;
  startY: number;
}

interface DragView {
  from: number;
  to: number;
}

function slotAt(clientX: number, row: HTMLDivElement, slotWidth: number) {
  const rect = row.getBoundingClientRect();
  return Math.floor((clientX - rect.left + row.scrollLeft) / slotWidth);
}

/**
 * Modal showing the top N cards of a stack as a row of faces the user can
 * drag to reorder. Portaled to `document.body` (ancestor `backdrop-filter`
 * breaks `position: fixed`). Hosts remount it per open via `key`.
 */
export function PeekModal({
  isOpen,
  cards,
  totalCount,
  focusCount = false,
  onChangeCount,
  getFaceUrl,
  canDiscard,
  onDone,
  onClose,
}: PeekModalProps) {
  const [order, setOrder] = useState<PeekPlacement[]>(() =>
    cards.map((entry) => ({ entry, dest: 'top' as const })),
  );
  const [session, setSession] = useState<DragSession | null>(null);
  const [view, setView] = useState<DragView | null>(null);
  const [countDraft, setCountDraft] = useState(String(cards.length));
  const rowRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef<HTMLInputElement | null>(null);

  const { width, height } = getPreviewDimensions('small');
  const slotWidth = width + CARD_GAP;

  useEffect(() => {
    if (!isOpen || !focusCount) return;
    countRef.current?.focus();
    countRef.current?.select();
  }, [isOpen, focusCount]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!session) return;
    let started = false;
    let to = session.from;
    const clampSlot = (clientX: number) => {
      const row = rowRef.current;
      if (!row) return session.from;
      const slot = slotAt(clientX, row, slotWidth);
      return Math.max(0, Math.min(order.length - 1, slot));
    };

    const handleMove = (ev: PointerEvent) => {
      if (!started) {
        const dx = ev.clientX - session.startX;
        const dy = ev.clientY - session.startY;
        if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
        started = true;
      }
      to = clampSlot(ev.clientX);
      setView({ from: session.from, to });
    };

    const handleUp = (ev: PointerEvent) => {
      if (started) {
        to = clampSlot(ev.clientX);
        if (to !== session.from) {
          setOrder((prev) => {
            const next = prev.slice();
            const [moved] = next.splice(session.from, 1);
            next.splice(to, 0, moved);
            return next;
          });
        }
      }
      setSession(null);
      setView(null);
    };

    const cancel = () => {
      setSession(null);
      setView(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [session, order.length, slotWidth]);

  if (!isOpen) return null;

  const handleDone = () => {
    onDone(order);
  };

  const commitCount = () => {
    const parsed = Math.trunc(Number(countDraft));
    if (!Number.isFinite(parsed) || countDraft.trim() === '') {
      setCountDraft(String(order.length));
      return;
    }
    const next = Math.max(1, Math.min(totalCount, parsed));
    setCountDraft(String(next));
    if (next !== order.length) onChangeCount(next);
  };

  const setDest = (index: number, dest: PeekDestination) => {
    setOrder((prev) =>
      prev.map((placement, i) =>
        i === index ? { ...placement, dest } : placement,
      ),
    );
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
        className="deck-import-panel peek-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Peek"
        data-testid="peek-modal"
      >
        <div className="deck-import-header">
          <div className="deck-import-title">
            Peek at top {order.length} {order.length === 1 ? 'card' : 'cards'}
          </div>
          <label className="peek-modal-count">
            Cards
            <input
              ref={countRef}
              type="number"
              min={1}
              max={totalCount}
              value={countDraft}
              data-testid="peek-n-input"
              onChange={(e) => setCountDraft(e.currentTarget.value)}
              onBlur={commitCount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCount();
              }}
            />
            of {totalCount}
          </label>
          <button
            type="button"
            className="deck-import-close"
            onClick={onClose}
            aria-label="Close"
          >
            {'✕'}
          </button>
        </div>

        <div className="peek-modal-row" ref={rowRef}>
          {order.map(({ entry, dest }, index) => {
            const url = getFaceUrl(entry.code);
            const discardable = canDiscard(entry);
            const dragging = view?.from === index;
            const shift = !view
              ? 0
              : dragging
                ? (view.to - view.from) * slotWidth
                : computeShiftOffset(index, view.from, view.to, slotWidth);
            return (
              <div
                key={`${entry.code}-${index}`}
                className={`peek-modal-slot${dragging ? ' peek-modal-slot-dragging' : ''}`}
                style={{
                  width,
                  transform: shift ? `translateX(${shift}px)` : undefined,
                }}
                data-testid="peek-slot"
              >
                <div
                  className={`peek-modal-card${dragging ? ' peek-modal-card-dragging' : ''}`}
                  style={{ width, height }}
                  data-testid="peek-card"
                  data-code={entry.code}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || session) return;
                    e.preventDefault();
                    setSession({
                      from: index,
                      startX: e.clientX,
                      startY: e.clientY,
                    });
                  }}
                >
                  {index === 0 && <span className="peek-modal-top">Top</span>}
                  {url ? (
                    <img src={url} alt={entry.code} draggable={false} />
                  ) : (
                    <span className="peek-modal-code">{entry.code}</span>
                  )}
                </div>
                <select
                  className="peek-modal-dest"
                  data-testid="peek-dest"
                  aria-label={`Destination for ${entry.code}`}
                  value={dest}
                  onChange={(e) =>
                    setDest(index, e.currentTarget.value as PeekDestination)
                  }
                >
                  {DESTINATIONS.map(({ value, label }) => {
                    const blocked = value === 'discard' && !discardable;
                    return (
                      <option
                        key={value}
                        value={value}
                        disabled={blocked}
                        title={blocked ? 'No discard zone' : undefined}
                      >
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>

        <div className="deck-import-footer peek-modal-footer">
          <button
            type="button"
            className="peek-modal-cancel"
            onClick={onClose}
            data-testid="peek-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="deck-import-submit"
            onClick={handleDone}
            data-testid="peek-done"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
