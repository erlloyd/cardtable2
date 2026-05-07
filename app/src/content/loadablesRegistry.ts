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
