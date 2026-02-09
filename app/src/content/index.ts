/**
 * Content System
 *
 * High-level API for loading and instantiating game content.
 * Handles asset packs, scenarios, and table object creation.
 */

import type {
  Scenario,
  GameAssets,
  TableObject,
  AssetPack,
} from '@cardtable2/shared';
import {
  loadAssetPack,
  loadAssetPacks,
  loadScenario,
  loadScenarioFromString,
  loadAssetPackFromString,
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
import {
  loadAllPlugins,
  loadPlugin,
  getPluginScenarioUrl,
  loadLocalPluginDirectory,
  getLocalPluginFile,
  type LoadedPlugin,
  type LocalPlugin,
  type PluginManifest,
  type PluginRegistryEntry,
} from './pluginLoader';

// Re-export types for convenience
export type { GameAssets } from '@cardtable2/shared';
export type { LoadedPlugin, LocalPlugin, PluginManifest, PluginRegistryEntry };

// Re-export functions for convenience
export {
  loadAssetPack,
  loadAssetPacks,
  loadScenario,
  loadScenarioFromString,
  loadAssetPackFromString,
  mergeAssetPacks,
  resolveCard,
  resolveAllCards,
  resolveAssetUrl,
  getCardDimensions,
  expandDeck,
  namespaceDeckCards,
  namespaceCardCode,
  instantiateScenario,
  loadAllPlugins,
  loadPlugin,
  loadLocalPluginDirectory,
};

// ============================================================================
// High-Level API
// ============================================================================

export interface LoadedContent {
  scenario: Scenario;
  content: GameAssets;
  objects: Map<string, TableObject>;
}

/**
 * Metadata about a loaded scenario, stored in Y.Doc for persistence and multiplayer sync
 *
 * Uses discriminated union to ensure type safety - each scenario type has its required fields.
 */
export type LoadedScenarioMetadata =
  | {
      type: 'plugin';
      pluginId: string;
      scenarioFile: string;
      loadedAt: number;
      scenarioName: string;
    }
  | {
      type: 'builtin';
      scenarioUrl: string;
      loadedAt: number;
      scenarioName: string;
    }
  | {
      type: 'local-dev';
      loadedAt: number;
      scenarioName: string;
    };

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

/**
 * Find a game in the games index by ID
 *
 * @param gameId - The game ID to look up
 * @returns Game entry with id, name (optional), and manifestUrl
 * @throws Error if games index cannot be loaded or game is not found
 *
 * @example
 * ```typescript
 * const game = await findGameInIndex('testgame');
 * console.log(game.manifestUrl); // '/scenarios/testgame-basic.json'
 * ```
 */
export async function findGameInIndex(
  gameId: string,
): Promise<{ id: string; name?: string; manifestUrl: string }> {
  // Load games index
  let response;
  try {
    response = await fetch('/gamesIndex.json');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error loading games index: ${message}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load games index: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const gamesIndex = (await response.json()) as {
    games: Array<{ id: string; name?: string; manifestUrl: string }>;
  };

  const game = gamesIndex.games.find((g) => g.id === gameId);

  if (!game) {
    const availableGames = gamesIndex.games.map((g) => g.id).join(', ');
    throw new Error(
      `Game "${gameId}" not found. Available games: ${availableGames}`,
    );
  }

  return game;
}

/**
 * Load all asset packs for a game
 *
 * Loads all asset packs referenced by the game's default scenario manifest,
 * but does NOT instantiate any scenario objects. This provides access to
 * all cards, tokens, and other assets for manual object creation.
 *
 * @param gameId - The game ID from gamesIndex.json
 * @returns Merged content from all packs
 *
 * @example
 * ```typescript
 * const content = await loadGameAssetPacks('testgame');
 * // Content has all cards/tokens but no scenario objects
 * const card = resolveCard('01001', content);
 * ```
 */
export async function loadGameAssetPacks(gameId: string): Promise<GameAssets> {
  // Find the game in the index
  const game = await findGameInIndex(gameId);

  // Load the scenario to get pack list (but don't instantiate)
  let scenario;
  try {
    scenario = await loadScenario(game.manifestUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load scenario for game "${gameId}" from ${game.manifestUrl}: ${message}`,
    );
  }

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
    return `/packs/${packId}.json`;
  });

  // Load all packs in parallel
  let packs;
  try {
    packs = await loadAssetPacks(packUrls);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load asset packs for game "${gameId}": ${message}`,
    );
  }

  // Merge and return
  return mergeAssetPacks(packs);
}

// ============================================================================
// Plugin-Based Loading
// ============================================================================

/**
 * Load a scenario from a plugin
 *
 * This loads a scenario from a plugin repository, fetching all required
 * asset packs and instantiating the scenario objects.
 *
 * @param pluginId - The plugin ID from pluginsIndex.json
 * @param scenarioFilename - The scenario filename from the plugin manifest
 * @returns Complete loaded content ready to be added to Y.Doc
 *
 * @example
 * ```typescript
 * const content = await loadPluginScenario('marvelchampions', 'marvelchampions-rhino-scenario.json');
 * // Add objects to Y.Doc
 * for (const [id, obj] of content.objects) {
 *   store.addObject(id, obj);
 * }
 * ```
 */
export async function loadPluginScenario(
  pluginId: string,
  scenarioFilename: string,
): Promise<LoadedContent> {
  // Load plugin manifest
  const plugin = await loadPlugin(pluginId);

  // Get scenario URL
  const scenarioUrl = getPluginScenarioUrl(plugin, scenarioFilename);

  // Load scenario using existing infrastructure
  // Pass plugin baseUrl so pack IDs can be resolved to plugin URLs
  // Remove trailing slash for consistency with loadCompleteScenario logic
  const baseUrl = plugin.registry.baseUrl.replace(/\/$/, '');
  return loadCompleteScenario(scenarioUrl, baseUrl);
}

/**
 * Load a scenario from a local plugin directory
 *
 * Prompts the user to select a plugin directory, reads all files locally,
 * and loads the scenario. This is useful for plugin development.
 *
 * @param scenarioFilename - The scenario filename from the plugin manifest
 * @returns Complete loaded content ready to be added to Y.Doc
 *
 * @example
 * ```typescript
 * const content = await loadLocalPluginScenario('marvelchampions-rhino-scenario.json');
 * // Add objects to Y.Doc
 * for (const [id, obj] of content.objects) {
 *   store.setObject(id, obj);
 * }
 * ```
 */
export async function loadLocalPluginScenario(
  scenarioFilename?: string,
): Promise<LoadedContent> {
  // Prompt user to select directory
  const plugin = await loadLocalPluginDirectory();

  // If no scenario specified, use first one from manifest
  const targetScenario = scenarioFilename ?? plugin.manifest.scenarios[0];
  if (!targetScenario) {
    throw new Error('No scenario found in plugin manifest');
  }

  // Load scenario JSON
  const scenarioJson = await getLocalPluginFile(plugin, targetScenario);
  const scenario = loadScenarioFromString(scenarioJson, targetScenario);

  // Load all asset packs referenced by scenario
  const packs: AssetPack[] = [];
  for (const packRef of scenario.packs) {
    // Pack references can be IDs (need .json extension) or full filenames
    const packFilename = packRef.endsWith('.json')
      ? packRef
      : `${packRef}.json`;
    const packJson = await getLocalPluginFile(plugin, packFilename);
    const pack = loadAssetPackFromString(packJson, packFilename);
    packs.push(pack);
  }

  // Merge packs
  const content = mergeAssetPacks(packs);

  // Replace relative image paths with blob URLs from local filesystem
  replaceImagePathsWithBlobUrls(content, plugin.imageUrls);

  // Instantiate scenario objects
  const objects = instantiateScenario(scenario, content);

  return {
    scenario,
    content,
    objects,
  };
}

/**
 * Reload a scenario from stored metadata
 *
 * This function is called on table mount to restore previously loaded scenarios.
 * It reads the metadata from Y.Doc and reloads the appropriate scenario type.
 *
 * Note: 'local-dev' type scenarios cannot be reloaded (require user interaction)
 *
 * @param metadata - Loaded scenario metadata from Y.Doc
 * @returns Complete loaded content ready to be set as gameAssets
 * @throws Error if scenario cannot be reloaded or metadata is invalid
 *
 * @example
 * ```typescript
 * const metadata = store.metadata.get('loadedScenario');
 * if (metadata) {
 *   const content = await reloadScenarioFromMetadata(metadata);
 *   setGameAssets(content.content);
 * }
 * ```
 */
export async function reloadScenarioFromMetadata(
  metadata: LoadedScenarioMetadata,
): Promise<LoadedContent> {
  console.log('[Content] Reloading scenario from metadata:', {
    type: metadata.type,
    scenarioName: metadata.scenarioName,
    loadedAt: new Date(metadata.loadedAt).toISOString(),
  });

  switch (metadata.type) {
    case 'plugin':
      // Type system guarantees pluginId and scenarioFile are present
      return loadPluginScenario(metadata.pluginId, metadata.scenarioFile);

    case 'builtin':
      // Type system guarantees scenarioUrl is present
      return loadCompleteScenario(metadata.scenarioUrl);

    case 'local-dev':
      console.error('[Content] Cannot reload local-dev scenario', {
        errorId: 'CONTENT_RELOAD_LOCAL_DEV_UNSUPPORTED',
        metadata,
      });
      throw new Error(
        'Cannot automatically reload local-dev scenarios (requires user interaction)',
      );

    default: {
      // TypeScript exhaustiveness checking means metadata is 'never' here.
      // However, since metadata comes from Y.Doc (potentially corrupted/stale),
      // we handle unexpected runtime values defensively.
      const unknownMetadata = metadata as { type?: unknown };
      const typeValue = unknownMetadata.type;
      const unknownType =
        typeof typeValue === 'string' ||
        typeof typeValue === 'number' ||
        typeof typeValue === 'boolean'
          ? String(typeValue)
          : 'undefined';
      console.error('[Content] Unknown metadata type during scenario reload', {
        errorId: 'CONTENT_RELOAD_UNKNOWN_TYPE',
        receivedType: unknownType,
        metadata: unknownMetadata,
      });
      throw new Error(
        `Cannot reload scenario: unknown metadata type "${unknownType}".`,
      );
    }
  }
}

/**
 * Replace relative image paths in GameAssets with blob URLs
 *
 * This is used for local plugin loading to replace paths like "tokens/damage.png"
 * with blob URLs like "blob:http://localhost:3000/abc-123-def" that point to
 * the actual file data in memory.
 *
 * Handles both relative paths (e.g., "tokens/damage.png") and already-resolved
 * URLs (e.g., "http://localhost:3001/api/card-image/.../tokens/damage.png").
 *
 * @param content - Merged game assets to modify in-place
 * @param imageUrls - Map of relative paths to blob URLs
 */
function replaceImagePathsWithBlobUrls(
  content: GameAssets,
  imageUrls: Map<string, string>,
): void {
  let replacementCount = 0;

  // Helper to find blob URL for a given image path (relative or resolved)
  const findBlobUrl = (imagePath: string): string | undefined => {
    // Try direct lookup first (for relative paths)
    const directMatch = imageUrls.get(imagePath);
    if (directMatch) {
      return directMatch;
    }

    // Try matching by checking if URL ends with any of the relative paths
    // This handles already-resolved URLs like "http://.../tokens/damage.png"
    for (const [relativePath, blobUrl] of imageUrls.entries()) {
      if (imagePath.endsWith(relativePath)) {
        return blobUrl;
      }
    }

    return undefined;
  };

  // Replace tokenTypes images
  if (content.tokenTypes) {
    for (const tokenType of Object.values(content.tokenTypes)) {
      const blobUrl = findBlobUrl(tokenType.image);
      if (blobUrl) {
        tokenType.image = blobUrl;
        replacementCount++;
      }
    }
  }

  // Replace statusTypes images
  if (content.statusTypes) {
    for (const statusType of Object.values(content.statusTypes)) {
      const blobUrl = findBlobUrl(statusType.image);
      if (blobUrl) {
        statusType.image = blobUrl;
        replacementCount++;
      }
    }
  }

  // Replace iconTypes images
  if (content.iconTypes) {
    for (const iconType of Object.values(content.iconTypes)) {
      const blobUrl = findBlobUrl(iconType.image);
      if (blobUrl) {
        iconType.image = blobUrl;
        replacementCount++;
      }
    }
  }

  console.log(
    `[Content] Replaced ${replacementCount} image paths with blob URLs`,
  );
}
