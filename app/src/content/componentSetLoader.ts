/**
 * Static Component Set Loader
 *
 * Loads a static component set from the plugin manifest onto the table.
 * Uses the shared resolve + instantiate pipeline.
 */

import type { GameAssets, StaticComponentSetEntry } from '@cardtable2/shared';
import type { TableObject } from '@cardtable2/shared';
import { resolveComponentSet, instantiateComponentSet } from './componentSet';

// ============================================================================
// Types
// ============================================================================

export interface LoadStaticOptions {
  entry: StaticComponentSetEntry;
  gameAssets: GameAssets;
}

export type LoadStaticResult =
  | { objectCount: number; objects: Map<string, TableObject> }
  | { error: string };

// ============================================================================
// Main Loading Function
// ============================================================================

/**
 * Load a static component set and return the instantiated objects.
 *
 * The caller is responsible for adding objects to the YjsStore.
 * Never throws — errors are returned as { error: string }.
 */
export function loadStaticComponentSet(
  options: LoadStaticOptions,
): LoadStaticResult {
  const { entry, gameAssets } = options;

  try {
    const resolved = resolveComponentSet(entry, gameAssets);
    const objects = instantiateComponentSet(resolved, gameAssets);

    return {
      objectCount: objects.size,
      objects,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to load component set "${entry.name}": ${message}`,
    };
  }
}
