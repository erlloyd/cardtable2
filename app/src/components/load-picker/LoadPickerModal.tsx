import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LoadableEntry, LoadableStaticItem } from '@cardtable2/shared';
import { fuzzySearch } from '../../utils/fuzzySearch';

/**
 * Cap on the number of items rendered for asset-pack-derived sources to
 * keep large catalogs (hundreds of cards) from causing first-render lag.
 * Search narrows the list well below the cap in practice; the cap kicks
 * in only on the empty-query first-paint path.
 */
const DERIVED_RENDER_CAP = 200;

/**
 * The shape of an item the picker hands back to the caller.  `data` is
 * deliberately `unknown` because per-type narrowing happens in the
 * host's loadable runtime (ct-8gf.2 / ct-8gf.5), not in the picker.
 */
export interface LoadPickerItem {
  id: string;
  label: string;
  data: unknown;
}

/**
 * Selection callback fired when the user picks an item.
 *
 * For provider-source entries (e.g. apiImport) the picker fires this
 * with `item: null` — there is no concrete item to select; the host
 * runtime takes over from there to drive the provider's flow (it
 * opens the `DeckImportModal` to collect a deck id). When the only
 * loadable for a `presetType` is a provider source, the picker
 * auto-fires this with `item: null` on open without showing step 2
 * (see ct-yj2). The full wiring lives in `loadHandler.ts`.
 */
export type LoadPickerSelectHandler = (
  entry: LoadableEntry,
  item: LoadPickerItem | null,
) => void;

/**
 * Optional resolver the host supplies to materialize the items shown
 * for a `kind: 'asset-pack-derived'` entry.  Kept as a callback (rather
 * than baking the resolution into the picker) so the picker stays a
 * pure presentational component — the real resolver runs against
 * `GameAssets` on the host side.
 */
export type DerivedItemsResolver = (entry: LoadableEntry) => LoadPickerItem[];

interface LoadPickerModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called when the modal should close (Esc, backdrop click, after select). */
  onClose: () => void;
  /** Loadable categories declared by the active plugin. */
  loadables: LoadableEntry[];
  /**
   * If set, the picker skips step 1 and renders step 2 directly for the
   * loadable whose `type` matches.  Used by per-type "Load <X>…"
   * commands.
   */
  presetType?: string;
  /** Fired when the user picks an item. */
  onSelectItem: LoadPickerSelectHandler;
  /**
   * Resolver for `asset-pack-derived` entries.  If omitted (e.g. in
   * tests with no derived entries) the picker shows an empty list for
   * those entries.
   */
  resolveDerivedItems?: DerivedItemsResolver;
}

/**
 * Generic "Load…" picker.  Two-step flow:
 *
 *   step 1: pick a loadable type (skipped if `presetType` matches one)
 *   step 2: pick an item with optional text search
 *
 * For provider-source entries step 2 is auto-fired — the picker
 * immediately invokes `onSelectItem(entry, null)` and closes, letting
 * the host's loadable runtime drive the actual flow (deck-id prompt,
 * etc.) without an intermediate confirmation click (ct-yj2).
 *
 * Portaled to `document.body` per the CLAUDE.md backdrop-filter memory:
 * any ancestor with `backdrop-filter: blur(...)` becomes a containing
 * block for `position: fixed` descendants, which would break the
 * modal's full-viewport overlay.
 */
export function LoadPickerModal({
  open,
  onClose,
  loadables,
  presetType,
  onSelectItem,
  resolveDerivedItems,
}: LoadPickerModalProps) {
  const presetEntry = useMemo(
    () =>
      presetType
        ? (loadables.find((l) => l.type === presetType) ?? null)
        : null,
    [loadables, presetType],
  );

  const [selectedType, setSelectedType] = useState<string | null>(
    presetEntry ? presetEntry.type : null,
  );
  const [query, setQuery] = useState('');

  // Reset internal state whenever the modal opens or presetType changes
  // — closing without resetting would leak step-2 state into the next
  // open in two-step mode.
  useEffect(() => {
    if (open) {
      setSelectedType(presetEntry ? presetEntry.type : null);
      setQuery('');
    }
  }, [open, presetEntry]);

  // Esc closes; effective only while the modal is open so it doesn't
  // capture Esc when collapsed.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const activeEntry = useMemo<LoadableEntry | null>(() => {
    if (!selectedType) return null;
    return loadables.find((l) => l.type === selectedType) ?? null;
  }, [loadables, selectedType]);

  // Auto-fire for provider-source entries (ct-yj2): there's no decision
  // to be made on step 2 — the host runtime drives the provider flow
  // (deck-id prompt, etc.) — so skip the dead "Run import…" click.
  // A ref guards against re-firing when React re-runs the effect with
  // the same entry (e.g. parent re-render); the next open cycle resets
  // it because `open` flipping to false runs the cleanup.
  const autoFiredEntryRef = useRef<LoadableEntry | null>(null);
  useEffect(() => {
    if (!open) {
      autoFiredEntryRef.current = null;
      return;
    }
    if (!activeEntry) return;
    if (activeEntry.source.kind !== 'provider') return;
    if (autoFiredEntryRef.current === activeEntry) return;
    autoFiredEntryRef.current = activeEntry;
    onSelectItem(activeEntry, null);
    onClose();
  }, [open, activeEntry, onSelectItem, onClose]);

  const items = useMemo<LoadPickerItem[]>(() => {
    if (!activeEntry) return [];
    const source = activeEntry.source;
    if (source.kind === 'static') {
      return source.items.map((it: LoadableStaticItem) => ({
        id: it.id,
        label: it.label,
        data: it.data,
      }));
    }
    if (source.kind === 'asset-pack-derived') {
      return resolveDerivedItems ? resolveDerivedItems(activeEntry) : [];
    }
    // provider — items handled separately (action UI, not a list)
    return [];
  }, [activeEntry, resolveDerivedItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // Cap on first-paint to avoid lag for very large catalogs.
      return items.slice(0, DERIVED_RENDER_CAP);
    }
    // Search across label and id so users can find a card by either its
    // display name or its stable code (e.g., MarvelCDB-style "01001A").
    return fuzzySearch(items, q, (it) => `${it.label} ${it.id}`);
  }, [items, query]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setQuery('');
  };

  const handleBack = () => {
    if (presetEntry) {
      // In preset mode, "back" from step 2 closes the picker — there's
      // no step 1 to return to.
      handleClose();
      return;
    }
    setSelectedType(null);
    setQuery('');
  };

  const handlePickItem = (item: LoadPickerItem) => {
    if (!activeEntry) return;
    onSelectItem(activeEntry, item);
    handleClose();
  };

  // Backdrop click — only close if the click landed on the backdrop
  // itself, not on the panel.  Prevents accidental closes when the
  // user releases a drag started inside the panel.
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  // Focus first interactive element when modal opens / step changes.
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    // Prefer the search input on step 2; otherwise the first list button.
    const panel = panelRef.current;
    if (!panel) return;
    const target =
      panel.querySelector<HTMLElement>('input[type="text"]') ??
      panel.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus();
  }, [open, selectedType]);

  if (!open) return null;

  const showStep1 = !activeEntry;

  const modal = (
    <div
      className="load-picker-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="load-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-label={
          showStep1
            ? 'Choose what to load'
            : `Choose ${activeEntry.label.toLowerCase()}`
        }
        ref={panelRef}
        data-testid="load-picker-panel"
      >
        <div className="load-picker-header">
          {!showStep1 && (
            <button
              type="button"
              className="load-picker-back"
              onClick={handleBack}
              aria-label={presetEntry ? 'Close' : 'Back to types'}
            >
              {presetEntry ? '✕' : '←'}
            </button>
          )}
          <div className="load-picker-title">
            {showStep1 ? 'Load…' : activeEntry.label}
          </div>
          {showStep1 && (
            <button
              type="button"
              className="load-picker-close"
              onClick={handleClose}
              aria-label="Close"
            >
              {'✕'}
            </button>
          )}
        </div>

        {/*
          Provider entries render nothing in the body — the auto-fire
          effect above (ct-yj2) invokes onSelectItem + onClose
          immediately, so the dead "Run import…" UI is never shown.
         */}
        {showStep1 ? (
          <Step1TypeList loadables={loadables} onPickType={handleSelectType} />
        ) : activeEntry.source.kind === 'provider' ? null : (
          <Step2ItemList
            items={filteredItems}
            totalItems={items.length}
            query={query}
            onQueryChange={setQuery}
            onPickItem={handlePickItem}
          />
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

interface Step1Props {
  loadables: LoadableEntry[];
  onPickType: (type: string) => void;
}

function Step1TypeList({ loadables, onPickType }: Step1Props) {
  if (loadables.length === 0) {
    return <div className="load-picker-empty">No loadables declared</div>;
  }
  // Semantic <ul><li><button> markup so screen readers announce each row as
  // a list item AND a button (ct-rde). Putting role='listitem' directly on
  // the <button> would override the implicit button role.
  return (
    <ul
      className="load-picker-types"
      aria-label="Loadable types"
      data-testid="load-picker-types"
    >
      {loadables.map((entry) => (
        <li key={entry.type} className="load-picker-types-item">
          <button
            type="button"
            className="load-picker-type"
            onClick={() => onPickType(entry.type)}
            data-testid={`load-picker-type-${entry.type}`}
          >
            <div className="load-picker-type-label">{entry.label}</div>
            <div className="load-picker-type-meta">{describeSource(entry)}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function describeSource(entry: LoadableEntry): string {
  const source = entry.source;
  if (source.kind === 'static') {
    const n = source.items.length;
    return `${String(n)} item${n === 1 ? '' : 's'}`;
  }
  if (source.kind === 'asset-pack-derived') {
    return source.derivation === 'all-cards' ? 'All cards' : 'All card sets';
  }
  return 'Provider';
}

interface Step2Props {
  items: LoadPickerItem[];
  totalItems: number;
  query: string;
  onQueryChange: (q: string) => void;
  onPickItem: (item: LoadPickerItem) => void;
}

// Provider-source entries auto-fire from the modal-level effect (ct-yj2);
// Step2ItemList is only mounted for static / asset-pack-derived entries.
function Step2ItemList({
  items,
  totalItems,
  query,
  onQueryChange,
  onPickItem,
}: Step2Props) {
  const showingCappedHint = !query.trim() && totalItems > items.length;

  if (totalItems === 0) {
    return <div className="load-picker-empty">No items available</div>;
  }

  return (
    <div className="load-picker-step2">
      <input
        type="text"
        className="load-picker-search"
        placeholder="Search…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-label="Search items"
      />

      {items.length === 0 ? (
        <div className="load-picker-empty">No items match</div>
      ) : (
        // Semantic <ul><li><button> markup so screen readers announce each
        // row as a list item AND a button (ct-rde). Empty-match state
        // renders a plain message instead of an empty list to avoid an
        // <ul> with zero <li> children.
        <ul
          className="load-picker-items"
          aria-label="Items"
          data-testid="load-picker-items"
        >
          {items.map((it) => (
            <li key={it.id} className="load-picker-items-item">
              <button
                type="button"
                className="load-picker-item"
                onClick={() => onPickItem(it)}
                data-testid={`load-picker-item-${it.id}`}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showingCappedHint && (
        <div className="load-picker-hint">
          Showing {String(items.length)} of {String(totalItems)} — refine search
          to narrow.
        </div>
      )}
    </div>
  );
}
