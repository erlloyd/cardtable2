/**
 * Runtime registry for the active plugin's `loadables[]`.
 *
 * Module-level state populated when a plugin is loaded, cleared on table
 * reset / plugin switch. Picker UI and command palette read from this
 * registry rather than re-parsing the manifest.
 *
 * Asset-pack-derived sources are materialized into static items at population
 * time using the merged `GameAssets`. Static sources pass through unchanged.
 * Provider sources retain their `module` / `config` so the action layer can
 * invoke them when the picker selection fires.
 *
 * The registry also tracks the active plugin's base URL and a map of
 * blob URLs (for local-dev plugins) so `resolveParserModuleUrl` can produce
 * a usable URL for the worker sandbox to fetch the plugin's parser JS.
 */

import {
  COUNTER_LOADABLE_TYPE,
  type CounterTypeDef,
  type GameAssets,
  type LoadableEntry,
  type LoadableStaticItem,
} from '@cardtable2/shared';
import {
  COUNTER_DEFAULT_COLOR,
  COUNTER_DEFAULT_MAX,
  COUNTER_DEFAULT_MIN,
  COUNTER_DEFAULT_STARTING_VALUE,
  COUNTER_TYPE_GENERIC,
} from '../renderer/objects/counter/constants';

let currentEntries: LoadableEntry[] = [];
let currentPluginBaseUrl = '';
let currentBlobUrls: Map<string, string> = new Map();

/**
 * Replace the registry's contents with the supplied loadables, computing
 * derived items from the supplied game assets where applicable.
 *
 * Idempotent: callers may invoke this multiple times during a session
 * (e.g. plugin eager-load followed by scenario load); the latest call wins.
 *
 * @param entries - Loadable categories from the plugin manifest
 * @param gameAssets - Merged game assets (used to materialize derived sources)
 * @param pluginBaseUrl - Plugin base URL for resolving parser module paths
 *   (registered plugins) — empty string for local-dev plugins which use
 *   blob URLs instead.
 * @param blobUrls - Optional map of relative-path → blob-URL for local-dev
 *   plugins. Used by `resolveParserModuleUrl` to find the in-memory script.
 */
export function setLoadableEntries(
  entries: LoadableEntry[],
  gameAssets: GameAssets,
  pluginBaseUrl?: string,
  blobUrls?: Map<string, string>,
): void {
  currentEntries = entries.map((entry) => resolveEntry(entry, gameAssets));
  currentPluginBaseUrl = pluginBaseUrl ?? '';
  currentBlobUrls = blobUrls ?? new Map<string, string>();
}

/**
 * Read the current resolved loadable entries — raw, exactly as the active
 * plugin declared them (after asset-pack-derivation). Use this when you need
 * the plugin's declared shape verbatim (storage tests, scenario load
 * pipeline). For UI / action consumers, prefer {@link getLoadableEntriesForUi},
 * which decorates this list with the host-guaranteed synthetic Generic
 * counter so `Load Counter…` is always reachable.
 */
export function getLoadableEntries(): LoadableEntry[] {
  return currentEntries;
}

/**
 * Read the current loadable entries with host-supplied decorations applied.
 *
 * Today the only decoration is the **synthetic Generic counter** (ct-8vh):
 *
 * - If the active plugin declares no `counter` loadable entry, this function
 *   prepends a synthetic one (`type: 'counter'`, `mode: 'additive'`, static
 *   source with a single Generic item).
 * - If the plugin DOES declare a `counter` entry (e.g. testgame with damage
 *   /threat, marvelchampions with its typed counters), the synthetic Generic
 *   item is prepended to that entry's `source.items` array so the picker
 *   always surfaces Generic alongside the typed counters.
 *
 * Why decorate here (not at each consumer): both the picker UI (driven by the
 * route's `loadables` state) AND the dynamic per-type `Load <X>…` actions
 * registered by `registerLoadablesActions` flow from this single registry
 * read. Injecting once at the registry's UI-view boundary means the
 * synthetic counter naturally appears in: the picker's type list, the
 * picker's item list when `presetType === 'counter'`, the
 * `load-counter` command, and the counter resolver in `counterRegistry`
 * (whose `typeId === 'generic'` lookup now succeeds).
 *
 * Asset-pack-derived sources are already materialized at populate time by
 * {@link setLoadableEntries}, so the decoration runs over `kind: 'static'`
 * entries only — no game-asset dependency is introduced here.
 */
export function getLoadableEntriesForUi(): LoadableEntry[] {
  return decorateWithSyntheticGenericCounter(currentEntries);
}

/**
 * Read the active plugin's base URL (registered plugins) or empty string
 * (local-dev plugins). Used by deck-import to construct module URLs.
 */
export function getLoadablesPluginBaseUrl(): string {
  return currentPluginBaseUrl;
}

/**
 * Resolve a parser-module filename to a usable URL for the worker sandbox.
 *
 * Local-dev plugins ship blob URLs (the directory picker creates one per
 * script file at upload time); registered plugins concatenate the relative
 * filename onto the plugin's remote `baseUrl`.
 *
 * @param filename - Module path relative to the plugin's baseUrl
 * @returns A URL the worker can fetch (blob: or absolute http(s):)
 */
export function resolveParserModuleUrl(filename: string): string {
  // Check blob URLs first (local plugins)
  const blobUrl = currentBlobUrls.get(filename);
  if (blobUrl) return blobUrl;

  // Fall back to remote URL
  if (currentPluginBaseUrl) {
    return `${currentPluginBaseUrl}${filename}`;
  }

  return filename;
}

/**
 * Reset the registry. Called when the active plugin changes (room load,
 * plugin switch) so a stale plugin's loadables don't leak into the new one.
 */
export function clearLoadableEntries(): void {
  currentEntries = [];
  currentPluginBaseUrl = '';
  currentBlobUrls = new Map();
}

// ============================================================================
// Selectors
// ============================================================================
// Filtering loadables[] by `type` (e.g. "scenario", "deck") is a recurring
// pattern: pluginLoader builds scenario URLs from the entries with
// `type === 'scenario'`; future call sites (picker pre-selection, action
// wiring) will want the same shape. Centralizing the filter keeps the
// shared/content-types invariants in one place rather than reimplementing
// `entries.filter(e => e.type === ...)` throughout.

/**
 * Return the subset of loadable entries whose `type` matches.
 *
 * Includes provider-source and asset-pack-derived entries — those have no
 * static `items` themselves but are still relevant to the type-level filter
 * (e.g. counting how many "scenario" categories a plugin exposes).
 *
 * For materialized item access, see {@link getStaticItems}.
 */
export function getLoadablesOfType(
  entries: LoadableEntry[],
  type: string,
): LoadableEntry[] {
  return entries.filter((entry) => entry.type === type);
}

/**
 * Flatten the static items across every entry of the given `type`.
 *
 * `setLoadableEntries` materializes asset-pack-derived sources into static
 * items at population time, so this selector returns items uniformly for
 * both `static` and `asset-pack-derived` declarations once the registry has
 * been populated. Provider-source entries contribute no items here — call
 * {@link getLoadablesOfType} if you need to discover provider categories.
 *
 * The generic `TData` lets callers narrow the per-item payload shape (e.g.
 * scenarios pin `{ file: string }`).
 */
export function getStaticItems<TData = unknown>(
  entries: LoadableEntry[],
  type: string,
): LoadableStaticItem<TData>[] {
  const items: LoadableStaticItem<TData>[] = [];
  for (const entry of entries) {
    if (entry.type !== type) continue;
    if (entry.source.kind !== 'static') continue;
    // After resolveEntry, asset-pack-derived sources are converted to static.
    // The shared schema types `items` as `LoadableStaticItem<unknown>` because
    // the discriminator carries no per-type narrowing; the generic narrows it
    // for callers who know the per-type shape.
    items.push(...(entry.source.items as LoadableStaticItem<TData>[]));
  }
  return items;
}

function resolveEntry(
  entry: LoadableEntry,
  gameAssets: GameAssets,
): LoadableEntry {
  const source = entry.source;
  if (source.kind !== 'asset-pack-derived') {
    return entry;
  }

  const items = deriveItems(source.derivation, gameAssets);
  return {
    ...entry,
    // Preserve `derivedFrom` so the picker UI can re-detect that this was
    // originally `all-cards` (and render the per-row card-image preview
    // affordance) without depending on plugin-defined `type` strings
    // (ct-87o).
    source: { kind: 'static', items, derivedFrom: source.derivation },
  };
}

function deriveItems(
  derivation: 'all-cards' | 'all-card-sets',
  gameAssets: GameAssets,
): LoadableStaticItem[] {
  if (derivation === 'all-cards') {
    // Merge two-sided cards: when cards A and B point at each other via
    // `back_code` (bidirectional partners — e.g., MC hero/alter-ego pairs),
    // they represent ONE physical card and should produce ONE picker entry.
    //
    // Cases:
    //  1. Bidirectional pair (A.back_code=B AND B.back_code=A):
    //     emit one item; typeId/data.code = lexicographically lower code
    //     (matches MC's A/B convention so the hero/scheme-front loads first).
    //     Label: `${lower.name||lowerCode} / ${higher.name||higherCode}`.
    //  2. Asymmetric (A.back_code=B but B.back_code !== A, or B has no
    //     back_code): emit A; do NOT emit B (B is image-only metadata).
    //  3. Dangling pointer (A.back_code=B but B not in cards): emit A only.
    //  4. No back_code: unchanged singleton.
    const cards = gameAssets.cards;
    const emitted = new Set<string>();
    const items: LoadableStaticItem[] = [];

    for (const [code, card] of Object.entries(cards)) {
      if (emitted.has(code)) continue;

      const partnerCode = card.back_code;
      if (partnerCode && partnerCode !== code) {
        const partner = cards[partnerCode];
        const isBidirectional =
          partner !== undefined && partner.back_code === code;

        if (isBidirectional) {
          // Pair → single merged item, keyed off the lower code.
          const [lowerCode, higherCode] =
            code < partnerCode ? [code, partnerCode] : [partnerCode, code];
          const lowerCard = cards[lowerCode];
          const higherCard = cards[higherCode];
          const lowerLabel = lowerCard.name || lowerCode;
          const higherLabel = higherCard.name || higherCode;
          items.push({
            typeId: lowerCode,
            label: `${lowerLabel} / ${higherLabel}`,
            data: { code: lowerCode },
          });
          emitted.add(lowerCode);
          emitted.add(higherCode);
          continue;
        }

        if (partner !== undefined) {
          // Asymmetric: A points at B but B doesn't point back. Emit A;
          // mark B emitted so it never appears as a separate entry.
          items.push({
            typeId: code,
            label: card.name || code,
            data: { code },
          });
          emitted.add(code);
          emitted.add(partnerCode);
          continue;
        }

        // Dangling pointer: partner code doesn't exist in cards. Fall through
        // to the singleton emit below.
      }

      // Singleton (no back_code, self-reference, or dangling pointer).
      items.push({
        typeId: code,
        label: card.name || code,
        data: { code },
      });
      emitted.add(code);
    }

    return items;
  }

  // 'all-card-sets'
  return Object.keys(gameAssets.cardSets).map((setName) => ({
    typeId: setName,
    label: setName,
    data: { setName },
  }));
}

// ============================================================================
// Synthetic Generic counter injection (ct-8vh)
// ============================================================================
// The host guarantees a Generic counter spawn path is always reachable from
// the Load… picker — even when the active plugin declares no counter
// loadables. We model that as a synthetic `LoadableStaticItem<CounterTypeDef>`
// prepended to the counter entry's items list. Whether the counter entry
// itself exists is handled here too: when the plugin omits it, we synthesize
// a whole `LoadableEntry` so the per-type `load-counter` action is
// registered alongside other plugin-declared types.

/** Stable typeId for the synthetic Generic counter item. */
const SYNTHETIC_GENERIC_COUNTER_TYPE_ID = COUNTER_TYPE_GENERIC;

/** Human-facing label for the synthetic Generic counter item. */
const SYNTHETIC_GENERIC_COUNTER_LABEL = 'Generic';

/**
 * Build the synthetic Generic counter item from the runtime defaults defined
 * in `renderer/objects/counter/constants`. Kept as a builder (not a const)
 * so the returned object is fresh per call — the picker / action layers
 * pass it through structured-clone-equivalent paths and shouldn't share
 * references across renders.
 */
function buildSyntheticGenericCounterItem(): LoadableStaticItem<CounterTypeDef> {
  return {
    typeId: SYNTHETIC_GENERIC_COUNTER_TYPE_ID,
    label: SYNTHETIC_GENERIC_COUNTER_LABEL,
    data: {
      color: COUNTER_DEFAULT_COLOR,
      min: COUNTER_DEFAULT_MIN,
      max: COUNTER_DEFAULT_MAX,
      startingValue: COUNTER_DEFAULT_STARTING_VALUE,
    },
  };
}

/**
 * Build the synthetic counter `LoadableEntry` used when the active plugin
 * declares no counter entry of its own. Mirrors the testgame /
 * marvelchampions shape: `type: 'counter'`, additive mode, static source.
 */
function buildSyntheticCounterEntry(): LoadableEntry {
  return {
    type: COUNTER_LOADABLE_TYPE,
    label: 'Counter',
    mode: 'additive',
    source: {
      kind: 'static',
      items: [buildSyntheticGenericCounterItem()],
    },
  };
}

/**
 * Decorate the registry's raw entries with the synthetic Generic counter.
 * See {@link getLoadableEntriesForUi} for the contract; this function is
 * the underlying transform.
 *
 * Invariants:
 * - Returns a new array; never mutates `entries`.
 * - When `entries` contains a counter entry with a non-static source,
 *   the entry is left untouched (the synthetic Generic is only sensible
 *   for static sources, which is the only counter shape the schema
 *   supports — see CounterTypeDef docs in shared/content-types).
 * - When `entries` contains a counter entry whose items already include
 *   a `generic`-id item, no second Generic is added — the plugin's
 *   declaration wins, matching the broader "first declaration wins"
 *   precedent used by `counterRegistry.resolveItems`.
 */
function decorateWithSyntheticGenericCounter(
  entries: LoadableEntry[],
): LoadableEntry[] {
  const counterEntryIndex = entries.findIndex(
    (entry) => entry.type === COUNTER_LOADABLE_TYPE,
  );

  if (counterEntryIndex === -1) {
    // No counter entry — synthesize the whole thing so the picker / action
    // layer naturally surfaces `Load Counter…` with a single Generic item.
    return [...entries, buildSyntheticCounterEntry()];
  }

  const counterEntry = entries[counterEntryIndex];
  if (counterEntry.source.kind !== 'static') {
    // Provider / asset-pack-derived counter sources aren't a thing the
    // current schema produces, but if a plugin ever declared one we
    // can't sensibly prepend a static synthetic item — leave it alone.
    return entries;
  }

  const items = counterEntry.source.items;
  const hasGeneric = items.some(
    (item) => item.typeId === SYNTHETIC_GENERIC_COUNTER_TYPE_ID,
  );
  if (hasGeneric) {
    // Plugin already declares a `generic` counter type — first declaration
    // wins. Pass entries through unchanged.
    return entries;
  }

  const decoratedEntry: LoadableEntry = {
    ...counterEntry,
    source: {
      ...counterEntry.source,
      items: [buildSyntheticGenericCounterItem(), ...items],
    },
  };
  const next = entries.slice();
  next[counterEntryIndex] = decoratedEntry;
  return next;
}
