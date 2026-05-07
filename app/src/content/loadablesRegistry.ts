/**
 * Runtime registry for the active plugin's `loadables[]`.
 *
 * Mirrors `componentSetRegistry`: module-level state populated when a plugin
 * is loaded, cleared on table reset / plugin switch. Picker UI and command
 * palette read from this registry rather than re-parsing the manifest.
 *
 * Asset-pack-derived sources are materialized into static items at population
 * time using the merged `GameAssets`. Static sources pass through unchanged.
 * Provider sources retain their `module` / `config` so the action layer can
 * invoke them when the picker selection fires.
 */

import type {
  GameAssets,
  LoadableEntry,
  LoadableStaticItem,
} from '@cardtable2/shared';

let currentEntries: LoadableEntry[] = [];

/**
 * Replace the registry's contents with the supplied loadables, computing
 * derived items from the supplied game assets where applicable.
 *
 * Idempotent: callers may invoke this multiple times during a session
 * (e.g. plugin eager-load followed by scenario load); the latest call wins.
 */
export function setLoadableEntries(
  entries: LoadableEntry[],
  gameAssets: GameAssets,
): void {
  currentEntries = entries.map((entry) => resolveEntry(entry, gameAssets));
}

/**
 * Read the current resolved loadable entries.
 */
export function getLoadableEntries(): LoadableEntry[] {
  return currentEntries;
}

/**
 * Reset the registry. Called when the active plugin changes (room load,
 * plugin switch) so a stale plugin's loadables don't leak into the new one.
 */
export function clearLoadableEntries(): void {
  currentEntries = [];
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
    return Object.entries(gameAssets.cards).map(([code]) => ({
      id: code,
      label: code,
      data: { code },
    }));
  }

  // 'all-card-sets'
  return Object.keys(gameAssets.cardSets).map((setName) => ({
    id: setName,
    label: setName,
    data: { setName },
  }));
}
