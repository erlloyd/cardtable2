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

import type {
  GameAssets,
  LoadableEntry,
  LoadableStaticItem,
} from '@cardtable2/shared';

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
 * Read the current resolved loadable entries.
 */
export function getLoadableEntries(): LoadableEntry[] {
  return currentEntries;
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
    source: { kind: 'static', items },
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
    //     emit one item; id/data.code = lexicographically lower code
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
            id: lowerCode,
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
            id: code,
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
        id: code,
        label: card.name || code,
        data: { code },
      });
      emitted.add(code);
    }

    return items;
  }

  // 'all-card-sets'
  return Object.keys(gameAssets.cardSets).map((setName) => ({
    id: setName,
    label: setName,
    data: { setName },
  }));
}
