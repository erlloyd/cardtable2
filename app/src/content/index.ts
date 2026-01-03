/**
 * Content System
 *
 * High-level API for loading and instantiating game content.
 * Handles asset packs, scenarios, and table object creation.
 */

import type { Scenario, MergedContent, TableObject } from '@cardtable2/shared';
import {
  loadAssetPack,
  loadAssetPacks,
  loadScenario,
  mergeAssetPacks,
  resolveCard,
  resolveAllCards,
  resolveAssetUrl,
  getCardDimensions,
} from './loader';
import {
  expandDeck,
  namespaceDeckCards,
  namespaceCardCode,
  instantiateScenario,
} from './instantiate';

// Re-export for convenience
export {
  loadAssetPack,
  loadAssetPacks,
  loadScenario,
  mergeAssetPacks,
  resolveCard,
  resolveAllCards,
  resolveAssetUrl,
  getCardDimensions,
  expandDeck,
  namespaceDeckCards,
  namespaceCardCode,
  instantiateScenario,
};

// ============================================================================
// High-Level API
// ============================================================================

export interface LoadedContent {
  scenario: Scenario;
  content: MergedContent;
  objects: Map<string, TableObject>;
}

/**
 * Load a complete scenario with all its packs and instantiate objects
 *
 * This is the main entry point for loading game content.
 * It handles:
 * - Loading the scenario manifest
 * - Loading all required asset packs
 * - Merging the packs
 * - Instantiating layout objects
 *
 * @param scenarioUrl - URL to the scenario JSON file
 * @param packBaseUrl - Optional base URL for resolving pack URLs (if packs use relative paths)
 * @returns Complete loaded content ready to be added to Y.Doc
 *
 * @example
 * ```typescript
 * const content = await loadCompleteScenario('/scenarios/testgame-basic.json');
 * // Add objects to Y.Doc
 * for (const [id, obj] of content.objects) {
 *   store.addObject(id, obj);
 * }
 * ```
 */
export async function loadCompleteScenario(
  scenarioUrl: string,
  packBaseUrl?: string,
): Promise<LoadedContent> {
  // Load scenario
  const scenario = await loadScenario(scenarioUrl);

  // Resolve pack URLs
  const packUrls = scenario.packs.map((packId) => {
    // If packId looks like a URL, use it directly
    if (
      packId.startsWith('http://') ||
      packId.startsWith('https://') ||
      packId.startsWith('/')
    ) {
      return packId;
    }
    // Otherwise, construct URL from packId
    // Default to /packs/<packId>.json
    const baseUrl = packBaseUrl ?? '/packs';
    return `${baseUrl}/${packId}.json`;
  });

  // Load all packs in parallel
  const packs = await loadAssetPacks(packUrls);

  // Merge packs
  const content = mergeAssetPacks(packs);

  // Instantiate scenario objects
  const objects = instantiateScenario(scenario, content);

  return {
    scenario,
    content,
    objects,
  };
}

/**
 * Load scenario metadata without instantiating objects
 *
 * Useful for previewing scenarios or loading manifest information
 * without the full content loading overhead.
 *
 * @param scenarioUrl - URL to the scenario JSON file
 * @returns Scenario manifest
 */
export async function loadScenarioMetadata(
  scenarioUrl: string,
): Promise<Scenario> {
  return loadScenario(scenarioUrl);
}
